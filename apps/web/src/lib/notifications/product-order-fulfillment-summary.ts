import type { SupabaseClient } from "@supabase/supabase-js";

function formatAddress(parts: Array<string | null | undefined>): string {
  return parts.filter((p) => p && String(p).trim()).join(", ");
}

/**
 * One-line pickup/delivery summary for order_confirmation and COD placed emails.
 */
export async function buildProductOrderFulfillmentSummary(
  supabase: SupabaseClient,
  productOrderId: string,
): Promise<string> {
  const { data: order } = await (supabase.from("product_orders") as any)
    .select(
      `
      fulfillment_type,
      estimated_delivery_date,
      collection_location:provider_locations (
        name, address_line1, address_line2, city, state, postal_code
      ),
      delivery_address:user_addresses (
        city, state, postal_code
      )
    `,
    )
    .eq("id", productOrderId)
    .maybeSingle();

  if (!order) return "";

  const type = String((order as { fulfillment_type?: string }).fulfillment_type ?? "");
  if (type === "collection") {
    const loc = (order as { collection_location?: Record<string, string | null> | null })
      .collection_location;
    if (!loc) return "In-store pickup";
    const addr = formatAddress([
      loc.name,
      loc.address_line1,
      loc.address_line2,
      loc.city,
      loc.state,
      loc.postal_code,
    ]);
    return addr ? `Pickup: ${addr}` : `Pickup: ${loc.name ?? "Store"}`;
  }

  if (type === "delivery") {
    const addr = (order as { delivery_address?: Record<string, string | null> | null }).delivery_address;
    const cityLine = formatAddress([addr?.city, addr?.state, addr?.postal_code]);
    const eta = (order as { estimated_delivery_date?: string | null }).estimated_delivery_date;
    const etaPart = eta ? ` · ETA ${eta}` : "";
    return cityLine ? `Delivery to ${cityLine}${etaPart}` : `Delivery${etaPart}`;
  }

  return "";
}
