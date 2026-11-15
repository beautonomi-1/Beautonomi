import type { SupabaseClient } from "@supabase/supabase-js";
import {
  applyPosProductStockDecrementsReversible,
  restorePosProductStock,
  validatePosProductStock,
} from "@/lib/provider-sales/pos-product-stock";
import { syncProductOrderLinesToOrderStatus } from "@/lib/ecommerce/product-order-line-fulfilment";

type SupabaseLike = SupabaseClient;

/** Keep the original payment time. A later delivery must not move the till day. */
export function preservedWalkInPaidAt(
  existingPaidAt: string | null | undefined,
  deliveredAt: string,
): string {
  const existing = typeof existingPaidAt === "string" ? existingPaidAt.trim() : "";
  return existing || deliveredAt;
}

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
    .select("id, provider_id, order_source, payment_status, status, paid_at")
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
    await syncProductOrderLinesToOrderStatus(supabase, orderId, "delivered");
    return { ok: true };
  }

  const { data: lineItems } = await (supabase.from("product_order_items") as any)
    .select("product_id, product_variant_id, quantity, fulfilment_status")
    .eq("order_id", orderId);

  const posItems = (lineItems ?? [])
    .filter((item: { fulfilment_status?: string | null }) => String(item.fulfilment_status ?? "") !== "cancelled")
    .map((item: any) => ({
    type: "product" as const,
    item_id: item.product_id,
    product_variant_id: item.product_variant_id ?? null,
    quantity: item.quantity,
  }));

  const stockError = await validatePosProductStock(supabase as any, providerId, posItems);
  if (stockError) {
    return { ok: false, reason: stockError };
  }

  const taken = await applyPosProductStockDecrementsReversible(supabase as any, posItems);

  const deliveredAt = new Date().toISOString();
  let statusUpdate = (supabase.from("product_orders") as any)
    .update({
      status: "delivered",
      delivered_at: deliveredAt,
      paid_at: preservedWalkInPaidAt((order as { paid_at?: string | null }).paid_at, deliveredAt),
      updated_at: deliveredAt,
    })
    .eq("id", orderId)
    .eq("provider_id", providerId);
  statusUpdate = order.status
    ? statusUpdate.eq("status", order.status)
    : statusUpdate.is("status", null);
  const { data: claimed, error: statusError } = await statusUpdate.select("id").maybeSingle();
  if (statusError || !claimed) {
    await restorePosProductStock(supabase as any, taken);
    if (statusError) {
      throw new Error(statusError.message || "The sale could not be marked delivered");
    }
    throw new Error("The sale could not be marked delivered");
  }

  try {
    const { logSaleStockMovements } = await import("@/lib/products/stock-movements");
    await logSaleStockMovements(supabase as any, {
      providerId,
      referenceId: orderId,
      actorUserId: input.actorUserId ?? undefined,
      lines: (lineItems ?? [])
        .filter((i: { fulfilment_status?: string | null }) => String(i.fulfilment_status ?? "") !== "cancelled")
        .map((i: any) => ({
          productId: i.product_id,
          productVariantId: i.product_variant_id ?? null,
          quantity: i.quantity,
        })),
    });
  } catch (logErr) {
    console.error("[fulfill-walk-in-delivery] stock movement log failed:", logErr);
  }

  await syncProductOrderLinesToOrderStatus(supabase, orderId, "delivered");

  return { ok: true };
}
