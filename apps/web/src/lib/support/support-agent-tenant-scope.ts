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

/**
 * When role is support_agent, restrict support_tickets queries to assigned tenant regions.
 * Superadmin and other staff roles are unchanged (global).
 */
export async function applySupportAgentTicketScope<T>(
  supabase: SupabaseClient,
  query: T,
  params: { role: string | null | undefined; userId: string },
): Promise<T> {
  if (!isSupportAgentRole(params.role)) {
    return query;
  }
  const tenantIds = await getSupportAgentTenantIds(supabase, params.userId);
  if (tenantIds.length === 0) {
    return (query as { in: (col: string, vals: string[]) => T }).in(
      "tenant_id",
      ["00000000-0000-0000-0000-000000000000"],
    );
  }
  return (query as { in: (col: string, vals: string[]) => T }).in("tenant_id", tenantIds);
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
