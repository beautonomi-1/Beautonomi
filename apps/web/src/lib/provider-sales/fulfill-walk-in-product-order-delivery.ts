import type { SupabaseClient } from "@supabase/supabase-js";
import {
  applyPosProductStockDecrements,
  validatePosProductStock,
} from "@/lib/provider-sales/pos-product-stock";

type SupabaseLike = SupabaseClient;

/**
 * Decrement stock and mark a paid walk-in product order as delivered.
 * Idempotent when the order is already delivered.
 */
export async function fulfillWalkInProductOrderDelivery(input: {
  supabase: SupabaseLike;
  providerId: string;
  orderId: string;
  actorUserId?: string | null;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const { supabase, providerId, orderId } = input;

  const { data: order } = await (supabase.from("product_orders") as any)
    .select("id, provider_id, order_source, payment_status, status")
    .eq("id", orderId)
    .eq("provider_id", providerId)
    .maybeSingle();

  if (!order) return { ok: false, reason: "order_not_found" };
  if (String(order.order_source ?? "") !== "walk_in") {
    return { ok: false, reason: "not_walk_in" };
  }
  if (String(order.payment_status ?? "") !== "paid") {
    return { ok: false, reason: "payment_not_settled" };
  }
  if (String(order.status ?? "") === "delivered") {
    return { ok: true };
  }

  const { data: lineItems } = await (supabase.from("product_order_items") as any)
    .select("product_id, product_variant_id, quantity")
    .eq("order_id", orderId);

  const posItems = (lineItems ?? []).map((item: any) => ({
    type: "product" as const,
    item_id: item.product_id,
    product_variant_id: item.product_variant_id ?? null,
    quantity: item.quantity,
  }));

  const stockError = await validatePosProductStock(supabase as any, providerId, posItems);
  if (stockError) {
    return { ok: false, reason: stockError };
  }

  await applyPosProductStockDecrements(supabase as any, posItems);

  try {
    const { logSaleStockMovements } = await import("@/lib/products/stock-movements");
    await logSaleStockMovements(supabase as any, {
      providerId,
      referenceId: orderId,
      actorUserId: input.actorUserId ?? undefined,
      lines: (lineItems ?? []).map((i: any) => ({
        productId: i.product_id,
        productVariantId: i.product_variant_id ?? null,
        quantity: i.quantity,
      })),
    });
  } catch (logErr) {
    console.error("[fulfill-walk-in-delivery] stock movement log failed:", logErr);
  }

  await (supabase.from("product_orders") as any)
    .update({
      status: "delivered",
      delivered_at: new Date().toISOString(),
      paid_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", orderId)
    .eq("provider_id", providerId);

  return { ok: true };
}
