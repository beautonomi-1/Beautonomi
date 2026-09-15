/**
 * Control-plane AI config is platform-wide (global tenant_id IS NULL).
 * Superadmin requests default to global unless scope=tenant is explicit.
 */
import type { ScopeKind } from "@/lib/tenant/scoped-overrides";
import { resolveRequestedScope } from "@/lib/tenant/scoped-overrides";

export const CHEAP_GLOBAL_ROUTING_POLICY = JSON.stringify({
  defaultTier: "lite",
  taskTier: {
    complex_reasoning: "flash",
    copilot: "flash",
  },
});

export function resolveAiPlatformScope(
  request: Request,
  body: Record<string, unknown> | null | undefined,
  currentTenantId: string,
  actorRole?: string | null,
): { scope: ScopeKind; tenantId: string | null } {
  const search = new URL(request.url).searchParams;
  const hasExplicitScope =
    (typeof body?.scope === "string" && body.scope.trim().length > 0) ||
    Boolean(search.get("scope")?.trim());

  if (!hasExplicitScope && String(actorRole ?? "").toLowerCase() === "superadmin") {
    return { scope: "global", tenantId: null };
  }

  return resolveRequestedScope(request, body, currentTenantId, { actorRole });
}
