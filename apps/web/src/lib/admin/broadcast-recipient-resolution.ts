import type { SupabaseClient } from "@supabase/supabase-js";

export function isMissingColumnError(error: unknown, column: string): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as Record<string, unknown>;
  const code = typeof record.code === "string" ? record.code : "";
  const message = typeof record.message === "string" ? record.message : "";
  return code === "42703" && message.includes(column);
}

export type CustomerRecipientResolution =
  | { userIds: string[]; mode: "tenant_preferred" }
  | { userIds: string[]; mode: "fallback_all_customers_column_missing" }
  | { userIds: string[]; mode: "fallback_all_customers_empty_tenant" };

export type ProviderRecipientResolution =
  | { userIds: string[]; mode: "tenant_scoped" }
  | { userIds: string[]; mode: "fallback_active_providers_empty_tenant" };

/**
 * Resolve customer user IDs for admin broadcasts — mirrors push-route fallback when
 * `preferred_home_tenant_id` is missing or yields zero rows.
 */
export async function resolveBroadcastCustomerUserIds(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<CustomerRecipientResolution> {
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

  let userIds = users?.map((u: { id: string }) => u.id) ?? [];
  if (userIds.length === 0) {
    console.warn(
      "[broadcast] No customers with preferred_home_tenant_id=%s; falling back to all customers",
      tenantId,
    );
    const { data: fallbackUsers, error: fallbackUsersError } = await supabase
      .from("users")
      .select("id")
      .eq("role", "customer");
    if (fallbackUsersError) {
      throw fallbackUsersError;
    }
    userIds = fallbackUsers?.map((u: { id: string }) => u.id) ?? [];
    return { userIds, mode: "fallback_all_customers_empty_tenant" };
  }

  return { userIds, mode: "tenant_preferred" };
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
