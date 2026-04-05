import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Resolve `tenant_id` for `finance_transactions` and other money rows.
 * Prefer booking tenant, then provider tenant, then legacy ZA tenant (`tenant_default_za_id`).
 */
export async function resolveTenantIdForFinanceLedger(
  supabase: SupabaseClient,
  booking: { tenant_id?: string | null; provider_id?: string | null },
): Promise<string> {
  const direct = typeof booking.tenant_id === "string" ? booking.tenant_id.trim() : "";
  if (direct) return direct;
  const pid = typeof booking.provider_id === "string" ? booking.provider_id.trim() : "";
  if (pid) {
    const { data } = await supabase.from("providers").select("tenant_id").eq("id", pid).maybeSingle();
    const tid = (data as { tenant_id?: string | null } | null)?.tenant_id;
    if (typeof tid === "string" && tid.trim()) return tid.trim();
  }
  const { data: zaId, error } = await supabase.rpc("tenant_default_za_id");
  if (error) throw new Error(`tenant_default_za_id: ${error.message}`);
  if (zaId == null) throw new Error("tenant_default_za_id returned null");
  return String(zaId);
}
