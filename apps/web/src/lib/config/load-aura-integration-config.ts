import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { fetchScopedSingle } from "@/lib/tenant/scoped-overrides";

export type AuraIntegrationRow = {
  enabled?: boolean;
  api_key_secret?: string | null;
  org_id?: string | null;
};

/**
 * Resolve Aura integration for a tenant: tenant override first (even when disabled),
 * then global default (tenant_id null).
 */
export async function loadAuraIntegrationConfig(
  environment: string,
  tenantId: string | null,
): Promise<AuraIntegrationRow | null> {
  const supabase = getSupabaseAdmin();
  const effectiveTenantId = tenantId?.trim() ? tenantId.trim() : "";

  const scoped = await fetchScopedSingle<AuraIntegrationRow>({
    supabase,
    table: "aura_integration_config",
    tenantId: effectiveTenantId,
    select: "enabled, api_key_secret, org_id",
    apply: (q) => q.eq("environment", environment),
    orderBy: { column: "updated_at", ascending: false },
  });

  return scoped.data;
}
