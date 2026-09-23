/**
 * Training path resolution, completion rules, and quiz grading (admin KB).
 */

export type ArticleStatus = "published" | "draft" | "scheduled" | "archived" | "missing";

export type ResolvedStep = {
  step: number;
  slug: string;
  status: ArticleStatus;
  id?: string;
  title?: string;
  summary?: string | null;
  audience?: string;
  is_internal?: boolean;
  content_type?: string | null;
};

export type CheckpointQuestion = {
  id: string;
  prompt: string;
  choices: string[];
  answer_index: number;
};

export type CheckpointQuestionPublic = Omit<CheckpointQuestion, "answer_index">;

export type ArticleRow = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  audience: string;
  is_internal: boolean;
  status: string;
  content_type: string | null;
};

const VALID_STATUSES = new Set(["published", "draft", "scheduled", "archived"]);

export function normalizeArticleStatus(raw: string | undefined): ArticleStatus {
  if (!raw) return "missing";
  if (VALID_STATUSES.has(raw)) return raw as ArticleStatus;
  return "missing";
}

export function resolveTrainingSteps(
  articleSlugs: string[],
  articleMap: Map<string, ArticleRow>,
): ResolvedStep[] {
  return articleSlugs.map((slug, idx) => {
    const article = articleMap.get(slug);
    if (!article) {
      return { step: idx + 1, slug, status: "missing" as const };
    }
    const status = normalizeArticleStatus(article.status);
    return {
      step: idx + 1,
      slug,
      status: status === "missing" ? "missing" : status,
      id: article.id,
      title: article.title,
      summary: article.summary,
      audience: article.audience,
      is_internal: article.is_internal,
      content_type: article.content_type,
    };
  });
}

export function publishedSteps(steps: ResolvedStep[]): ResolvedStep[] {
  return steps.filter((s) => s.status === "published");
}

export function pathHasBlockingSteps(steps: ResolvedStep[]): boolean {
  return steps.some((s) => s.status !== "published");
}

export function canSignOffStep(step: ResolvedStep): boolean {
  return step.status === "published";
}

export function computeCompletion(params: {
  steps: ResolvedStep[];
  signedOffSlugs: Set<string>;
  quizPassed: boolean;
  checkpointQuiz: CheckpointQuestion[];
}): { complete: boolean; reason?: string } {
  const { steps, signedOffSlugs, quizPassed, checkpointQuiz } = params;
  if (pathHasBlockingSteps(steps)) {
    return { complete: false, reason: "PATH_HAS_UNPUBLISHED_OR_MISSING_STEPS" };
  }
  const pub = publishedSteps(steps);
  for (const s of pub) {
    if (!signedOffSlugs.has(s.slug)) {
      return { complete: false, reason: "STEPS_INCOMPLETE" };
    }
  }
  if (checkpointQuiz.length > 0 && !quizPassed) {
    return { complete: false, reason: "QUIZ_NOT_PASSED" };
  }
  return { complete: true };
}

export function stripQuizAnswers(quiz: CheckpointQuestion[]): CheckpointQuestionPublic[] {
  return quiz.map(({ id, prompt, choices }) => ({ id, prompt, choices }));
}

export function gradeCheckpointQuiz(
  quiz: CheckpointQuestion[],
  answers: Record<string, number>,
): { passed: boolean; failedQuestionIds: string[] } {
  const failedQuestionIds: string[] = [];
  for (const q of quiz) {
    const submitted = answers[q.id];
    if (typeof submitted !== "number" || submitted !== q.answer_index) {
      failedQuestionIds.push(q.id);
    }
  }
  return { passed: failedQuestionIds.length === 0, failedQuestionIds };
}

export function firstContinueSlug(
  steps: ResolvedStep[],
  signedOffSlugs: Set<string>,
): string | null {
  for (const s of publishedSteps(steps)) {
    if (!signedOffSlugs.has(s.slug)) return s.slug;
  }
  return null;
}

export function parseKnowledgeBaseTab(param: string | null): "paths" | "browse" {
  return param === "browse" ? "browse" : "paths";
}
