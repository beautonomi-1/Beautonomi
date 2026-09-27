import type { SupabaseClient } from "@supabase/supabase-js";

export async function loadTenantSlug(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<string> {
  const { data } = await supabase.from("tenants").select("slug").eq("id", tenantId).maybeSingle();
  return String(data?.slug ?? "market");
}

export async function loadTenantCurrency(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<string> {
  const { data } = await supabase.from("tenants").select("default_currency").eq("id", tenantId).maybeSingle();
  return String(data?.default_currency ?? "ZAR").toUpperCase();
}
