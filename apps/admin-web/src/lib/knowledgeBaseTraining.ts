import type { KbArticleStepStatus, KbTrainingPathStep } from "@/lib/learning";

export function parseKnowledgeBaseTab(param: string | null): "paths" | "browse" {
  return param === "browse" ? "browse" : "paths";
}

export function publishedPathSteps(steps: KbTrainingPathStep[]): KbTrainingPathStep[] {
  return steps.filter((s) => s.status === "published");
}

export function firstContinueSlug(
  steps: KbTrainingPathStep[],
  signedOffSlugs: string[],
): string | null {
  const signed = new Set(signedOffSlugs);
  for (const s of publishedPathSteps(steps)) {
    if (!signed.has(s.slug)) return s.slug;
  }
  return null;
}

export function countPublishedSteps(steps: KbTrainingPathStep[]): number {
  return publishedPathSteps(steps).length;
}

export function countSignedPublished(
  steps: KbTrainingPathStep[],
  signedOffSlugs: string[],
): number {
  const signed = new Set(signedOffSlugs);
  return publishedPathSteps(steps).filter((s) => signed.has(s.slug)).length;
}

export function stepStatusLabel(status: KbArticleStepStatus): string {
  switch (status) {
    case "published":
      return "Published";
    case "draft":
      return "Draft";
    case "scheduled":
      return "Scheduled";
    case "archived":
      return "Archived";
    case "missing":
      return "Missing";
    default:
      return status;
  }
}

export function stepIsCompletable(status: KbArticleStepStatus): boolean {
  return status === "published";
}
