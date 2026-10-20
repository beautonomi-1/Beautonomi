import type { SupabaseClient } from "@supabase/supabase-js";

/** Active tenant ids for a support_agent from user_tenant_roles. */
export async function getSupportAgentTenantIds(
  supabase: SupabaseClient,
  userId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("user_tenant_roles")
    .select("tenant_id")
    .eq("user_id", userId)
    .eq("is_active", true);
  if (error) throw error;
  const ids = (data ?? [])
    .map((r) => (r as { tenant_id?: string }).tenant_id)
    .filter((id): id is string => !!id);
  return [...new Set(ids)];
}

export function isSupportAgentRole(role: string | null | undefined): boolean {
  return String(role ?? "").toLowerCase() === "support_agent";
}

export function isSuperadminRole(role: string | null | undefined): boolean {
  return String(role ?? "").toLowerCase() === "superadmin";
}

const SUPPORT_AGENT_NO_TENANT = "00000000-0000-0000-0000-000000000000";

/**
 * Tenant ids a support_agent may see. Null means the caller should not add a
 * tenant filter (superadmin and other staff stay global).
 *
 * An agent with no active tenant assignments gets a sentinel id so the query
 * matches nothing.
 *
 * Resolved separately from the PostgREST builder: builders are thenable, and
 * returning one from an async function executes the request before `.range()`.
 */
export async function resolveSupportAgentTicketTenantIds(
  supabase: SupabaseClient,
  params: { role: string | null | undefined; userId: string },
): Promise<string[] | null> {
  if (!isSupportAgentRole(params.role)) {
    return null;
  }
  const tenantIds = await getSupportAgentTenantIds(supabase, params.userId);
  if (tenantIds.length === 0) {
    return [SUPPORT_AGENT_NO_TENANT];
  }
  return tenantIds;
}

/** Restrict a support_tickets query to the agent's tenants. Synchronous on purpose. */
export function applySupportAgentTicketScope<T extends { in: (column: string, values: string[]) => T }>(
  query: T,
  tenantIds: string[] | null,
): T {
  if (!tenantIds) return query;
  return query.in("tenant_id", tenantIds);
}

/** Returns false when support_agent cannot access this ticket (service-role detail checks). */
export async function supportAgentCanAccessTicketByTenant(
  supabase: SupabaseClient,
  params: { role: string | null | undefined; userId: string; tenantId: string | null | undefined },
): Promise<boolean> {
  if (!isSupportAgentRole(params.role)) {
    return true;
  }
  if (!params.tenantId) {
    return false;
  }
  const tenantIds = await getSupportAgentTenantIds(supabase, params.userId);
  return tenantIds.includes(params.tenantId);
}
