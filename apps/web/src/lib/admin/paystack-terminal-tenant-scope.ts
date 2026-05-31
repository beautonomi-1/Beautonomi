import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { fetchAllProviderIdsForTenant } from "@/lib/tenant/admin-tenant-scope";

export type PaystackTerminalTenantScope = {
  tenantId: string;
  providerIds: string[];
};

export async function resolvePaystackTerminalTenantScope(
  supabase: SupabaseClient,
  request: Request,
): Promise<PaystackTerminalTenantScope> {
  const tenantId = await resolveAdminApiTenantId(request);
  const providerIds = await fetchAllProviderIdsForTenant(supabase, tenantId);
  return { tenantId, providerIds };
}

export function providerBelongsToTenantScope(providerId: string, scope: PaystackTerminalTenantScope): boolean {
  return scope.providerIds.includes(providerId);
}
