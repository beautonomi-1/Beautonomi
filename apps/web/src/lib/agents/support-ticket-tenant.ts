import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Tenant scope for support tickets: explicit tenant_id, then provider tenant,
 * then the default ZA tenant for platform-level customer tickets.
 */
export async function resolveSupportTicketTenantId(
  supabase: SupabaseClient,
  ticket: { tenant_id?: string | null; provider_id?: string | null },
): Promise<string | null> {
  if (ticket.tenant_id) {
    return ticket.tenant_id;
  }
  if (ticket.provider_id) {
    const { data } = await supabase
      .from("providers")
      .select("tenant_id")
      .eq("id", ticket.provider_id)
      .maybeSingle();
    const tenantId = (data as { tenant_id?: string | null } | null)?.tenant_id;
    if (tenantId) return tenantId;
  }
  const { data: za } = await supabase.from("tenants").select("id").eq("slug", "za").maybeSingle();
  return (za as { id?: string } | null)?.id ?? null;
}
