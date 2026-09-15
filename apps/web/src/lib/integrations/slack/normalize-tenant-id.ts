/**
 * Platform-scoped Slack events use tenant_id NULL in the DB.
 * Callers historically passed the literal "platform" or null — normalize both.
 */
export function normalizeSlackTenantId(tenantId: string | null | undefined): string | null {
  if (tenantId == null) return null;
  const trimmed = tenantId.trim();
  if (!trimmed || trimmed === "platform") return null;
  return trimmed;
}

/** Stable string for in-process fallback maps (null → "platform"). */
export function slackTenantFallbackKey(tenantId: string | null): string {
  return tenantId ?? "platform";
}
