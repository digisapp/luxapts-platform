import { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api-helpers";
import { checkShowerAuth } from "@/lib/shower/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { PASSING_SCORE, gradeQuiz, quizBreakdown, type QuizQuestion } from "@/lib/shower/quiz";
import { z } from "zod";

const submitQuizSchema = z.object({
  answers: z.array(z.number().int().min(0)),
});

// Minimum wait between a failed attempt and the next one. Without it the quiz
// could be brute-forced in a tight loop (and, before this route stopped
// returning the answer key on failures, harvested in a single attempt).
const RETRY_COOLDOWN_MS = 10 * 60 * 1000;

const cooldownMessage = (seconds: number) =>
  `Please wait ${Math.max(1, Math.ceil(seconds / 60))} minute(s) before retrying this quiz.`;

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

    const questions = content.quiz_questions as QuizQuestion[];

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

    // Rate-limit retries. The cooldown is claimed with ONE conditional UPDATE
    // before grading: a read-then-stamp check let N parallel submissions all
    // pass and all be graded, and comparing their scores revealed the key.
    // Exactly one concurrent request can match this row.
    const attemptAt = new Date().toISOString();
    if (existing && needsKnowledgePass) {
      const cutoff = new Date(Date.now() - RETRY_COOLDOWN_MS).toISOString();
      const { data: gate, error: gateError } = await adminClient
        .from("shower_certifications")
        .update({ knowledge_last_attempt_at: attemptAt })
        .eq("id", existing.id)
        .or(`knowledge_last_attempt_at.is.null,knowledge_last_attempt_at.lt.${cutoff}`)
        .select("id");

      if (gateError) {
        console.error("Quiz cooldown check error:", gateError);
        return apiError("Failed to record quiz attempt", 500);
      }

      if (!gate || gate.length !== 1) {
        const { data: lastAttempt } = await adminClient
          .from("shower_certifications")
          .select("knowledge_last_attempt_at")
          .eq("id", existing.id)
          .maybeSingle();
        const lastAt = lastAttempt?.knowledge_last_attempt_at
          ? new Date(lastAttempt.knowledge_last_attempt_at).getTime()
          : NaN;
        const remainingMs = Number.isFinite(lastAt)
          ? lastAt + RETRY_COOLDOWN_MS - Date.now()
          : RETRY_COOLDOWN_MS;
        return apiError(cooldownMessage(remainingMs / 1000), 429);
      }
    }

    // Grade the quiz
    const { correctCount, score, passed } = gradeQuiz(questions, answers);

    const newAttempts = (existing?.knowledge_attempts || 0) + 1;
    const bestScore = Math.max(score, existing?.knowledge_best_score || 0);

    let newStatus = isExpired ? "in_progress" : (existing?.status || "in_progress");
    let knowledgePassedAt = null;

    if (passed && needsKnowledgePass) {
      knowledgePassedAt = new Date().toISOString();
      newStatus = content.shadows_required > 0 ? "shadow_pending" : "certified";
    }

    if (existing) {
      const { error: updateError } = await adminClient
        .from("shower_certifications")
        .update({
          knowledge_attempts: newAttempts,
          knowledge_best_score: bestScore,
          knowledge_last_attempt_at: attemptAt,
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
          knowledge_last_attempt_at: attemptAt,
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
        // unique(shower_id, building_id): a parallel first attempt won the
        // insert. Treat this one as inside the cooldown — and say nothing
        // about how it scored.
        if (insertError?.code === "23505") {
          return apiError(cooldownMessage(RETRY_COOLDOWN_MS / 1000), 429);
        }
        console.error("Quiz attempt insert error:", insertError);
        return apiError("Failed to record quiz attempt", 500);
      }
    }

    // The per-question breakdown (and answer key) only accompanies a pass;
    // see quizBreakdown.
    const breakdown = quizBreakdown(questions, answers, passed);

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
