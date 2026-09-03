/**
 * Per-family rollout flag for Vercel Workflows (Part N).
 * Set WORKFLOWS_ENABLED to a comma-separated list of families, or `all` / `*`.
 * When unset, legacy inline/cron paths run unchanged.
 */
export type WorkflowFamily =
  | "settlement"
  | "notification"
  | "agent"
  | "dunning"
  | "gift-card"
  | "ads"
  | "onboarding";

function parseEnabledFamilies(): Set<string> {
  const raw = process.env.WORKFLOWS_ENABLED?.trim();
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean),
  );
}

const ENABLED_FAMILIES = parseEnabledFamilies();

export function isWorkflowsEnabled(): boolean {
  return ENABLED_FAMILIES.size > 0;
}

export function isWorkflowFamilyEnabled(family: WorkflowFamily): boolean {
  if (!isWorkflowsEnabled()) return false;
  if (ENABLED_FAMILIES.has("all") || ENABLED_FAMILIES.has("*")) return true;
  return ENABLED_FAMILIES.has(family);
}
