// Certification quiz grading. Pure — the route handles auth, the cooldown and
// persistence.

export const PASSING_SCORE = 70; // percent

export type QuizQuestion = {
  question: string;
  options: string[];
  correct_index: number;
};

export function gradeQuiz(questions: QuizQuestion[], answers: number[]) {
  const correctCount = answers.filter(
    (answer, i) => answer === questions[i]?.correct_index
  ).length;
  const score = questions.length ? Math.round((correctCount / questions.length) * 100) : 0;
  return { correctCount, score, passed: score >= PASSING_SCORE };
}

/**
 * Per-question breakdown — only for a passing attempt. On a failure even a
 * per-question right/wrong flag gives the key away: a few submissions that
 * vary the answers reveal which option is correct for every question. A
 * failed attempt gets its score and nothing else.
 */
export function quizBreakdown(
  questions: QuizQuestion[],
  answers: number[],
  passed: boolean
) {
  if (!passed) return undefined;
  return questions.map((q, i) => ({
    question: q.question,
    your_answer: q.options[answers[i]] || "No answer",
    correct_answer: q.options[q.correct_index],
    correct: answers[i] === q.correct_index,
  }));
}
