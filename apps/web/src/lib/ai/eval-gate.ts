/**
 * Eval gate: production catalog rows cannot be enabled until eval_passed_at is set.
 */
export function canEnableCatalogModel(params: {
  environment: string;
  enabled: boolean;
  evalPassedAt: string | null | undefined;
}): { allowed: boolean; reason?: string } {
  if (!params.enabled) return { allowed: true };
  if (params.environment !== "production") return { allowed: true };
  if (params.evalPassedAt) return { allowed: true };
  return {
    allowed: false,
    reason: "eval_required_before_production_enable",
  };
}
