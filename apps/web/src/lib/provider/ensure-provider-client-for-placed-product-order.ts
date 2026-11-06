import type { SupabaseClient } from "@supabase/supabase-js";

export async function ensureProviderClientForPlacedProductOrder(
  supabaseAdmin: SupabaseClient,
  params: { providerId: string; customerId: string; productOrderId: string },
): Promise<void> {
  const { providerId, customerId, productOrderId } = params;
  const { data: existing } = await supabaseAdmin
    .from("provider_clients")
    .select("id")
    .eq("provider_id", providerId)
    .eq("customer_id", customerId)
    .maybeSingle();
  if (existing?.id) return;

  const { error } = await supabaseAdmin.from("provider_clients").insert({
    provider_id: providerId,
    customer_id: customerId,
    notes: null,
    relationship_source: "product_order",
    privacy_level: "standard",
    source_metadata: { linked_via: "online_product_order", product_order_id: productOrderId },
    linked_existing_platform_user: true,
  });
  if (error && error.code !== "23505") {
    throw error;
  }
}
