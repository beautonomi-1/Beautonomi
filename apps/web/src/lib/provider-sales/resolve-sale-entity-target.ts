import type { SupabaseClient } from "@supabase/supabase-js";

export type SaleEntityType =
  | "booking"
  | "group_booking"
  | "sale"
  | "product_order"
  | "additional_charge"
  | "invoice"
  | "other";

export type ResolvedSaleEntityTarget = {
  entityType: SaleEntityType;
  entityId: string;
};

/**
 * Product-only POS sales are stored in `product_orders` but legacy clients still send entity_type "sale".
 */
export async function resolveSaleEntityTarget(
  admin: SupabaseClient,
  providerId: string,
  entityType: string,
  entityId: string,
): Promise<ResolvedSaleEntityTarget> {
  if (entityType !== "sale" || !entityId) {
    return { entityType: entityType as SaleEntityType, entityId };
  }

  const { data: saleRow } = await admin
    .from("sales")
    .select("id")
    .eq("id", entityId)
    .eq("provider_id", providerId)
    .maybeSingle();
  if (saleRow?.id) {
    return { entityType: "sale", entityId };
  }

  const { data: orderRow } = await admin
    .from("product_orders")
    .select("id")
    .eq("id", entityId)
    .eq("provider_id", providerId)
    .eq("order_source", "walk_in")
    .maybeSingle();
  if (orderRow?.id) {
    return { entityType: "product_order", entityId: orderRow.id as string };
  }

  return { entityType: "sale", entityId };
}
