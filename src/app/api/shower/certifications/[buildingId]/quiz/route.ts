import { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api-helpers";
import { checkShowerAuth } from "@/lib/shower/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { z } from "zod";

const submitQuizSchema = z.object({
  answers: z.array(z.number().int().min(0)),
});

const PASSING_SCORE = 70; // percent

// Minimum wait between a failed attempt and the next one. Without it the quiz
// could be brute-forced in a tight loop (and, before this route stopped
// returning the answer key on failures, harvested in a single attempt).
const RETRY_COOLDOWN_MS = 10 * 60 * 1000;

// GET /api/shower/certifications/[buildingId]/quiz — load questions to take
// the quiz. Never returns correct_index (that would defeat the cert gate).
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ buildingId: string }> }
) {
  try {
    const auth = await checkShowerAuth();
    if (!auth.isShower) {
      return apiError(auth.error, auth.status);
    }

    const { buildingId } = await params;
    const adminClient = createAdminClient();

    const { data: content, error: contentError } = await adminClient
      .from("building_certification_content")
      .select("quiz_questions, shadows_required")
      .eq("building_id", buildingId)
      .single();

    if (contentError || !content) {
      return apiError("No certification content found for this building", 404);
    }

    const questions = (content.quiz_questions as Array<{
      question: string;
      options: string[];
      correct_index: number;
    }>) || [];

    // Strip the answer key before it leaves the server.
    const safeQuestions = questions.map((q) => ({
      question: q.question,
      options: q.options,
    }));

    return apiSuccess({
      questions: safeQuestions,
      total: safeQuestions.length,
      passing_score: PASSING_SCORE,
      shadows_required: content.shadows_required,
    });
  } catch (error) {
    console.error("Load quiz error:", error);
    return apiError("Internal server error", 500);
  }
}

// POST /api/shower/certifications/[buildingId]/quiz — submit quiz attempt
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ buildingId: string }> }
) {
  try {
    const auth = await checkShowerAuth();
    if (!auth.isShower) {
      return apiError(auth.error, auth.status);
    }

    const { buildingId } = await params;
    const rawBody = await req.json();
    const parsed = submitQuizSchema.safeParse(rawBody);
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message || "Invalid request");
    }

    const { answers } = parsed.data;
    const adminClient = createAdminClient();

    // Load quiz content
    const { data: content, error: contentError } = await adminClient
      .from("building_certification_content")
      .select("quiz_questions, shadows_required")
      .eq("building_id", buildingId)
      .single();

    if (contentError || !content) {
      return apiError("No certification content found for this building", 404);
    }

    const questions = content.quiz_questions as Array<{
      question: string;
      options: string[];
      correct_index: number;
    }>;

    if (!questions.length) {
      return apiError("No quiz questions available", 400);
    }

    if (answers.length !== questions.length) {
      return apiError(`Expected ${questions.length} answers`, 400);
    }

    // Validate each answer index is within bounds
    for (let i = 0; i < answers.length; i++) {
      if (answers[i] >= questions[i].options.length) {
        return apiError(`Answer ${i + 1} index out of bounds`, 400);
      }
    }

    // Load the certification record BEFORE grading so a cooldown can be
    // enforced without revealing anything about this submission.
    const { data: existing } = await adminClient
      .from("shower_certifications")
      .select("id, knowledge_attempts, knowledge_best_score, status, knowledge_passed_at, expires_at")
      .eq("shower_id", auth.showerId)
      .eq("building_id", buildingId)
      .maybeSingle();

    // A shower can re-certify if they haven't passed before OR if their cert has expired
    const isExpired = existing?.expires_at ? new Date(existing.expires_at) < new Date() : false;
    const needsKnowledgePass = !existing?.knowledge_passed_at || isExpired;

    // Rate-limit retries after a failed attempt. Read separately and
    // tolerantly: knowledge_last_attempt_at arrives in migration 024, and a
    // missing column must not take the whole quiz down.
    if (existing && needsKnowledgePass) {
      const { data: lastAttempt } = await adminClient
        .from("shower_certifications")
        .select("knowledge_last_attempt_at")
        .eq("id", existing.id)
        .maybeSingle();

      const lastAt = lastAttempt?.knowledge_last_attempt_at
        ? new Date(lastAttempt.knowledge_last_attempt_at).getTime()
        : null;

      if (lastAt !== null && Number.isFinite(lastAt)) {
        const elapsed = Date.now() - lastAt;
        if (elapsed >= 0 && elapsed < RETRY_COOLDOWN_MS) {
          const retryAfter = Math.ceil((RETRY_COOLDOWN_MS - elapsed) / 1000);
          return apiError(
            `Please wait ${Math.ceil(retryAfter / 60)} minute(s) before retrying this quiz.`,
            429
          );
        }
      }
    }

    // Grade the quiz
    const correctCount = answers.filter(
      (answer, i) => answer === questions[i].correct_index
    ).length;
    const score = Math.round((correctCount / questions.length) * 100);
    const passed = score >= PASSING_SCORE;

    const newAttempts = (existing?.knowledge_attempts || 0) + 1;
    const bestScore = Math.max(score, existing?.knowledge_best_score || 0);

    let newStatus = isExpired ? "in_progress" : (existing?.status || "in_progress");
    let knowledgePassedAt = null;

    if (passed && needsKnowledgePass) {
      knowledgePassedAt = new Date().toISOString();
      newStatus = content.shadows_required > 0 ? "shadow_pending" : "certified";
    }

    let certificationId = existing?.id ?? null;

    if (existing) {
      const { error: updateError } = await adminClient
        .from("shower_certifications")
        .update({
          knowledge_attempts: newAttempts,
          knowledge_best_score: bestScore,
          ...(knowledgePassedAt ? { knowledge_passed_at: knowledgePassedAt, status: newStatus } : {}),
          ...(knowledgePassedAt && newStatus === "certified" ? {
            certified_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
          } : {}),
        })
        .eq("id", existing.id);
      if (updateError) {
        console.error("Quiz attempt update error:", updateError);
        return apiError("Failed to record quiz attempt", 500);
      }
    } else {
      const { data: inserted, error: insertError } = await adminClient
        .from("shower_certifications")
        .insert({
          shower_id: auth.showerId,
          building_id: buildingId,
          knowledge_attempts: 1,
          knowledge_best_score: score,
          knowledge_passed_at: knowledgePassedAt,
          shadow_count: 0,
          status: newStatus,
          ...(newStatus === "certified" ? {
            certified_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
          } : {}),
        })
        .select("id")
        .single();
      if (insertError || !inserted) {
        console.error("Quiz attempt insert error:", insertError);
        return apiError("Failed to record quiz attempt", 500);
      }
      certificationId = inserted.id;
    }

    // Stamp the attempt time for the retry cooldown. Written separately and
    // tolerantly so a pre-migration-024 database still records the attempt
    // itself above.
    if (certificationId) {
      const { error: stampError } = await adminClient
        .from("shower_certifications")
        .update({ knowledge_last_attempt_at: new Date().toISOString() })
        .eq("id", certificationId);
      if (stampError) {
        console.error("Quiz attempt timestamp not recorded:", stampError.message);
      }
    }

    // Return score + question breakdown. The answer key is only disclosed once
    // the shower has actually passed — returning correct_answer on every
    // failed attempt let anyone harvest the full key in a single submission.
    const breakdown = questions.map((q, i) => ({
      question: q.question,
      your_answer: q.options[answers[i]] || "No answer",
      ...(passed ? { correct_answer: q.options[q.correct_index] } : {}),
      correct: answers[i] === q.correct_index,
    }));

    return apiSuccess({
      score,
      passed,
      correct: correctCount,
      total: questions.length,
      passing_score: PASSING_SCORE,
      breakdown,
      new_status: newStatus,
      shadows_required: content.shadows_required,
    });
  } catch (error) {
    console.error("Submit quiz error:", error);
    return apiError("Internal server error", 500);
  }
}
