"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertCircle, ArrowRight, Award, BookOpen, CheckCircle,
  Clock, Loader2, Users, XCircle,
} from "lucide-react";

type Question = { question: string; options: string[] };

/**
 * GET /api/shower/certifications/[buildingId]/quiz. The answer key is stripped
 * server-side, so questions carry no correct_index. Study fields are optional —
 * the route may or may not include them.
 */
type QuizResponse = {
  questions?: Question[];
  total?: number;
  passing_score?: number;
  shadows_required?: number;
  key_selling_points?: string | null;
  amenity_notes?: string | null;
  pet_policy_notes?: string | null;
  parking_notes?: string | null;
  pricing_notes?: string | null;
  study_content?: string | null;
};

/** POST result. `correct_answer` is only present when the attempt passed. */
type QuizResult = {
  score: number;
  passed: boolean;
  correct: number;
  total: number;
  passing_score: number;
  breakdown?: Array<{
    question: string;
    your_answer?: string;
    correct_answer?: string;
    correct: boolean;
  }>;
  new_status?: string;
  shadows_required?: number;
};

type StudySection = { label: string; body: string };

function studySections(data: QuizResponse): StudySection[] {
  return (
    [
      ["Key selling points", data.key_selling_points],
      ["Amenities", data.amenity_notes],
      ["Pet policy", data.pet_policy_notes],
      ["Parking", data.parking_notes],
      ["Pricing", data.pricing_notes],
      ["Study notes", data.study_content],
    ] as const
  )
    .filter(([, body]) => typeof body === "string" && body.trim().length > 0)
    .map(([label, body]) => ({ label, body: (body as string).trim() }));
}

/** Pull a human cooldown hint out of a 429 body, whatever shape it uses. */
function cooldownHint(body: Record<string, unknown>): string | null {
  const seconds =
    typeof body.retry_after_seconds === "number"
      ? body.retry_after_seconds
      : typeof body.retry_after === "number"
        ? body.retry_after
        : typeof body.cooldown_seconds === "number"
          ? body.cooldown_seconds
          : null;
  if (seconds != null && seconds > 0) {
    const minutes = Math.ceil(seconds / 60);
    return minutes > 1 ? `Try again in about ${minutes} minutes.` : "Try again in about a minute.";
  }
  if (typeof body.cooldown_until === "string") {
    const until = new Date(body.cooldown_until);
    if (!Number.isNaN(until.getTime())) {
      return `Try again after ${until.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })}.`;
    }
  }
  return null;
}

export function QuizClient({ buildingId }: { buildingId: string }) {
  const [quiz, setQuiz] = useState<QuizResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [studyMode, setStudyMode] = useState(true);
  const [answers, setAnswers] = useState<(number | null)[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<QuizResult | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadQuiz() {
      setLoading(true);
      try {
        const res = await fetch(`/api/shower/certifications/${buildingId}/quiz`);
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setLoadError(data.error || `Couldn't load the quiz (error ${res.status}).`);
          return;
        }
        const questions: Question[] = Array.isArray(data.questions) ? data.questions : [];
        setQuiz({ ...data, questions });
        setAnswers(questions.map(() => null));
        // Nothing to study? Go straight to the questions.
        setStudyMode(studySections(data).length > 0);
      } catch {
        if (!cancelled) {
          setLoadError("Couldn't load the quiz. Check your connection and try again.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadQuiz();
    return () => {
      cancelled = true;
    };
  }, [buildingId]);

  const questions = quiz?.questions ?? [];
  const passingScore = quiz?.passing_score ?? 70;
  const answeredCount = answers.filter((a) => a !== null).length;
  const allAnswered = questions.length > 0 && answeredCount === questions.length;

  async function handleSubmit() {
    if (!allAnswered || submitting) return;
    setSubmitting(true);
    setSubmitError(null);

    try {
      const res = await fetch(`/api/shower/certifications/${buildingId}/quiz`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: answers.map((a) => a ?? 0) }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        // 429 = attempt cooldown; surface the wait, not a generic failure
        const hint = res.status === 429 ? cooldownHint(data) : null;
        setSubmitError(
          [data.error || `Couldn't submit your answers (error ${res.status}).`, hint]
            .filter(Boolean)
            .join(" ")
        );
        return;
      }

      setResult(data as QuizResult);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setSubmitError("Couldn't submit your answers. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function retry() {
    setResult(null);
    setSubmitError(null);
    setAnswers(questions.map(() => null));
    setStudyMode(studySections(quiz ?? {}).length > 0);
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (loadError) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center space-y-3">
          <AlertCircle className="h-10 w-10 text-destructive/60" />
          <p className="font-medium">{loadError}</p>
          <Button variant="outline" asChild>
            <Link href="/shower/certifications">Back to Certifications</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  // ---- Result view -------------------------------------------------------
  if (result) {
    const shadowsRequired = result.shadows_required ?? 0;
    return (
      <div className="space-y-6">
        <Card className={result.passed ? "border-green-200" : "border-yellow-200"}>
          <CardContent className="py-8 text-center space-y-3">
            {result.passed ? (
              <CheckCircle className="mx-auto h-12 w-12 text-green-500" />
            ) : (
              <XCircle className="mx-auto h-12 w-12 text-yellow-500" />
            )}
            <h2 className="text-2xl font-bold">
              {result.passed ? "You passed!" : "Not quite yet"}
            </h2>
            <p className="text-muted-foreground">
              You scored <span className="font-medium text-foreground">{result.score}%</span> (
              {result.correct}/{result.total} correct). Passing score is {result.passing_score}%.
            </p>

            {result.passed ? (
              <div className="pt-2 space-y-3">
                <p className="text-sm text-muted-foreground">
                  {result.new_status === "certified"
                    ? "You are now certified for this building and can claim its leads."
                    : `Next up: shadow ${shadowsRequired || 2} certified Showers on live tours.`}
                </p>
                <Button asChild>
                  <Link href="/shower/certifications">
                    {result.new_status === "certified" ? (
                      <Award className="mr-2 h-4 w-4" />
                    ) : (
                      <Users className="mr-2 h-4 w-4" />
                    )}
                    Back to Certifications
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            ) : (
              <div className="pt-2 flex flex-col sm:flex-row gap-2 justify-center">
                <Button onClick={retry}>
                  <BookOpen className="mr-2 h-4 w-4" />
                  Study and retake
                </Button>
                <Button variant="outline" asChild>
                  <Link href="/shower/certifications">Back to Certifications</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {result.breakdown && result.breakdown.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Your answers</CardTitle>
              {!result.passed && (
                <CardDescription>
                  Correct answers are revealed once you pass — review the study
                  material and try again.
                </CardDescription>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              {result.breakdown.map((item, i) => (
                <div key={i} className="rounded-lg border p-3 space-y-1">
                  <div className="flex items-start gap-2">
                    {item.correct ? (
                      <CheckCircle className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                    )}
                    <p className="text-sm font-medium">
                      {i + 1}. {item.question}
                    </p>
                  </div>
                  <p className="pl-6 text-xs text-muted-foreground">
                    Your answer: {item.your_answer || "No answer"}
                  </p>
                  {!item.correct && item.correct_answer && (
                    <p className="pl-6 text-xs text-green-700">
                      Correct answer: {item.correct_answer}
                    </p>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  const sections = studySections(quiz ?? {});

  // ---- Study view --------------------------------------------------------
  if (studyMode && sections.length > 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BookOpen className="h-4 w-4" />
            Study material
          </CardTitle>
          <CardDescription>
            Review this before taking the {questions.length}-question quiz. You
            need {passingScore}% to pass.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {sections.map((section) => (
            <div key={section.label} className="space-y-1">
              <p className="text-sm font-medium">{section.label}</p>
              <p className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">
                {section.body}
              </p>
            </div>
          ))}
          <Button
            className="w-full"
            onClick={() => setStudyMode(false)}
            disabled={questions.length === 0}
          >
            {questions.length === 0 ? "No quiz questions yet" : "Start the quiz"}
            {questions.length > 0 && <ArrowRight className="ml-2 h-4 w-4" />}
          </Button>
        </CardContent>
      </Card>
    );
  }

  // ---- Quiz view ---------------------------------------------------------
  if (questions.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center space-y-3">
          <BookOpen className="h-10 w-10 text-muted-foreground/40" />
          <p className="font-medium">No quiz questions yet</p>
          <p className="text-sm text-muted-foreground max-w-sm">
            Admin hasn&apos;t published the certification quiz for this building.
            Check back soon or contact your manager.
          </p>
          <Button variant="outline" asChild>
            <Link href="/shower/certifications">Back to Certifications</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant="secondary">
          <Clock className="mr-1 h-3 w-3" />
          {answeredCount}/{questions.length} answered
        </Badge>
        <span className="text-sm text-muted-foreground">
          {passingScore}% needed to pass
        </span>
        {sections.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-8"
            onClick={() => setStudyMode(true)}
          >
            <BookOpen className="mr-2 h-4 w-4" />
            Review study material
          </Button>
        )}
      </div>

      {questions.map((q, qIndex) => (
        <Card key={qIndex}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium">
              {qIndex + 1}. {q.question}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {q.options.map((option, oIndex) => {
              const id = `q${qIndex}-o${oIndex}`;
              const checked = answers[qIndex] === oIndex;
              return (
                <label
                  key={id}
                  htmlFor={id}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition-colors ${
                    checked ? "border-primary bg-accent" : "hover:bg-accent/50"
                  }`}
                >
                  <input
                    type="radio"
                    id={id}
                    name={`question-${qIndex}`}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-current"
                    checked={checked}
                    onChange={() =>
                      setAnswers((prev) =>
                        prev.map((a, i) => (i === qIndex ? oIndex : a))
                      )
                    }
                  />
                  <span>{option}</span>
                </label>
              );
            })}
          </CardContent>
        </Card>
      ))}

      {submitError && (
        <div className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{submitError}</span>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-2">
        <Button
          className="flex-1"
          onClick={handleSubmit}
          disabled={!allAnswered || submitting}
        >
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Submitting...
            </>
          ) : allAnswered ? (
            "Submit Quiz"
          ) : (
            `Answer all ${questions.length} questions to submit`
          )}
        </Button>
        <Button variant="outline" asChild>
          <Link href="/shower/certifications">Cancel</Link>
        </Button>
      </div>
    </div>
  );
}
