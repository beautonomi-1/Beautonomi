import { describe, expect, it } from "vitest";
import {
  computeCompletion,
  gradeCheckpointQuiz,
  resolveTrainingSteps,
  stripQuizAnswers,
  type ArticleRow,
  type CheckpointQuestion,
} from "../training-paths";

function article(slug: string, status: string): ArticleRow {
  return {
    id: slug,
    slug,
    title: slug,
    summary: null,
    audience: "internal",
    is_internal: true,
    status,
    content_type: "article",
  };
}

describe("resolveTrainingSteps", () => {
  it("preserves order and flags missing slugs", () => {
    const map = new Map([["a", article("a", "published")]]);
    const steps = resolveTrainingSteps(["a", "missing", "b"], map);
    expect(steps.map((s) => s.slug)).toEqual(["a", "missing", "b"]);
    expect(steps[0].status).toBe("published");
    expect(steps[1].status).toBe("missing");
    expect(steps[2].status).toBe("missing");
  });

  it("surfaces draft and scheduled statuses", () => {
    const map = new Map([
      ["d", article("d", "draft")],
      ["s", article("s", "scheduled")],
    ]);
    const steps = resolveTrainingSteps(["d", "s"], map);
    expect(steps[0].status).toBe("draft");
    expect(steps[1].status).toBe("scheduled");
  });
});

describe("computeCompletion", () => {
  const pubSteps = resolveTrainingSteps(
    ["one", "two"],
    new Map([
      ["one", article("one", "published")],
      ["two", article("two", "published")],
    ]),
  );
  const quiz: CheckpointQuestion[] = [
    { id: "q1", prompt: "?", choices: ["a", "b"], answer_index: 0 },
  ];

  it("blocks when a step is not published", () => {
    const steps = resolveTrainingSteps(
      ["one"],
      new Map([["one", article("one", "draft")]]),
    );
    const r = computeCompletion({
      steps,
      signedOffSlugs: new Set(["one"]),
      quizPassed: true,
      checkpointQuiz: [],
    });
    expect(r.complete).toBe(false);
  });

  it("completes without quiz when checkpoint_quiz is empty", () => {
    const steps = resolveTrainingSteps(
      ["one"],
      new Map([["one", article("one", "published")]]),
    );
    const r = computeCompletion({
      steps,
      signedOffSlugs: new Set(["one"]),
      quizPassed: false,
      checkpointQuiz: [],
    });
    expect(r.complete).toBe(true);
  });

  it("requires all sign-offs and quiz when configured", () => {
    const signed = new Set(["one"]);
    expect(
      computeCompletion({
        steps: pubSteps,
        signedOffSlugs: signed,
        quizPassed: false,
        checkpointQuiz: quiz,
      }).complete,
    ).toBe(false);

    signed.add("two");
    expect(
      computeCompletion({
        steps: pubSteps,
        signedOffSlugs: signed,
        quizPassed: true,
        checkpointQuiz: quiz,
      }).complete,
    ).toBe(true);
  });
});

describe("gradeCheckpointQuiz", () => {
  const quiz: CheckpointQuestion[] = [
    { id: "q1", prompt: "?", choices: ["yes", "no"], answer_index: 1 },
  ];

  it("fails wrong answers and ignores extra keys in answers object", () => {
    expect(gradeCheckpointQuiz(quiz, { q1: 0, extra: 99 }).passed).toBe(false);
    expect(gradeCheckpointQuiz(quiz, { q1: 1 }).passed).toBe(true);
  });
});

describe("stripQuizAnswers", () => {
  it("removes answer_index from reader payload", () => {
    const out = stripQuizAnswers([
      { id: "q1", prompt: "P", choices: ["a"], answer_index: 0 },
    ]);
    expect(out[0]).toEqual({ id: "q1", prompt: "P", choices: ["a"] });
    expect("answer_index" in out[0]).toBe(false);
  });
});
