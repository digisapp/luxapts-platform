import { describe, it, expect } from "vitest";
import { PASSING_SCORE, gradeQuiz, quizBreakdown, type QuizQuestion } from "../shower/quiz";

const questions: QuizQuestion[] = [
  { question: "Q1", options: ["a", "b", "c", "d"], correct_index: 1 },
  { question: "Q2", options: ["a", "b", "c", "d"], correct_index: 2 },
  { question: "Q3", options: ["a", "b", "c", "d"], correct_index: 0 },
  { question: "Q4", options: ["a", "b", "c", "d"], correct_index: 3 },
];

describe("gradeQuiz", () => {
  it("scores a perfect attempt", () => {
    expect(gradeQuiz(questions, [1, 2, 0, 3])).toEqual({ correctCount: 4, score: 100, passed: true });
  });

  it("fails below the passing score", () => {
    const result = gradeQuiz(questions, [1, 2, 1, 1]);
    expect(result).toEqual({ correctCount: 2, score: 50, passed: false });
    expect(result.score).toBeLessThan(PASSING_SCORE);
  });

  it("passes exactly at the passing score", () => {
    const ten = Array.from({ length: 10 }, (_, i) => ({ question: `Q${i}`, options: ["a", "b"], correct_index: 0 }));
    expect(gradeQuiz(ten, [0, 0, 0, 0, 0, 0, 0, 1, 1, 1]).passed).toBe(true);
  });
});

describe("quizBreakdown", () => {
  it("reveals nothing per-question on a failed attempt", () => {
    // Even a right/wrong flag per question would let a few varied
    // submissions recover the key.
    expect(quizBreakdown(questions, [1, 2, 1, 1], false)).toBeUndefined();
  });

  it("includes answers and the key once passed", () => {
    const breakdown = quizBreakdown(questions, [1, 2, 0, 0], true);
    expect(breakdown).toHaveLength(4);
    expect(breakdown?.[3]).toEqual({ question: "Q4", your_answer: "a", correct_answer: "d", correct: false });
    expect(breakdown?.[0].correct).toBe(true);
  });
});
