import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export function isMissingColumnError(error: unknown, column: string): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as Record<string, unknown>;
  const code = typeof record.code === "string" ? record.code : "";
  const message = typeof record.message === "string" ? record.message : "";
  return code === "42703" && message.includes(column);
}

export type CustomerRecipientResolution =
  | { userIds: string[]; mode: "tenant_admin_scope" }
  | { userIds: string[]; mode: "fallback_preferred_home" }
  | { userIds: string[]; mode: "fallback_all_customers_column_missing" };

export type ProviderRecipientResolution =
  | { userIds: string[]; mode: "tenant_scoped" }
  | { userIds: string[]; mode: "fallback_active_providers_empty_tenant" };

/**
 * Resolve customer user IDs for admin broadcasts — tenant scope matches the admin user directory.
 * If the RPC is unavailable, falls back to preferred_home_tenant_id only (degraded).
 */
export async function resolveBroadcastCustomerUserIds(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<CustomerRecipientResolution> {
  const admin = getSupabaseAdmin();
  const { data: rpcRows, error: rpcErr } = await admin.rpc("admin_customer_ids_in_tenant_scope", {
    p_tenant_id: tenantId,
  });

  if (!rpcErr && rpcRows != null) {
    const userIds = ((rpcRows as { id: string }[]) ?? []).map((r) => r.id).filter(Boolean);
    return { userIds, mode: "tenant_admin_scope" };
  }

  if (rpcErr) {
    console.warn(
      "[broadcast] admin_customer_ids_in_tenant_scope failed; using preferred_home fallback:",
      rpcErr.message,
    );
  }

  const { data: users, error: usersError } = await supabase
    .from("users")
    .select("id")
    .eq("role", "customer")
    .eq("preferred_home_tenant_id", tenantId);

  if (usersError) {
    if (isMissingColumnError(usersError, "preferred_home_tenant_id")) {
      console.warn(
        "[broadcast] users.preferred_home_tenant_id missing, falling back to role-only customer targeting",
      );
      const { data: fallbackUsers, error: fallbackUsersError } = await supabase
        .from("users")
        .select("id")
        .eq("role", "customer");
      if (fallbackUsersError) {
        throw fallbackUsersError;
      }
      return {
        userIds: fallbackUsers?.map((u: { id: string }) => u.id) ?? [],
        mode: "fallback_all_customers_column_missing",
      };
    }
    throw usersError;
  }

  const userIds = users?.map((u: { id: string }) => u.id) ?? [];
  return { userIds, mode: "fallback_preferred_home" };
}

/**
 * Resolve provider owner user IDs — tenant scoped first; if none, active providers globally
 * (same intent as push broadcast when tenant scoping returns zero).
 */
export async function resolveBroadcastProviderUserIds(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<ProviderRecipientResolution> {
  const { data: providers, error: providerError } = await supabase
    .from("providers")
    .select("user_id")
    .eq("tenant_id", tenantId)
    .not("user_id", "is", null);

  if (providerError) {
    throw providerError;
  }

  let userIds = providers?.map((p: { user_id?: string }) => p.user_id).filter(Boolean) as string[];
  if (userIds.length > 0) {
    return { userIds, mode: "tenant_scoped" };
  }

  console.warn(
    "[broadcast] No providers for tenant_id=%s; falling back to active provider accounts",
    tenantId,
  );

  const { data: active, error: activeError } = await supabase
    .from("providers")
    .select("user_id")
    .eq("status", "active")
    .not("user_id", "is", null);

  if (activeError) {
    throw activeError;
  }

  userIds = active?.map((p: { user_id?: string }) => p.user_id).filter(Boolean) as string[];
  return { userIds, mode: "fallback_active_providers_empty_tenant" };
}
