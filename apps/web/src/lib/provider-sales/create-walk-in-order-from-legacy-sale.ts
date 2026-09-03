/**
 * Adapter: legacy POST /api/provider/sales (product lines only) → walk_in product_orders.
 * Non-product POS lines still use the legacy sales table.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { percentOf } from "@beautonomi/utils";
import {
  applyPosProductStockDecrements,
  validatePosProductStock,
} from "@/lib/provider-sales/pos-product-stock";
import { recordProductOrderPayment } from "@/lib/orders/record-product-order-payment";
import { logSaleStockMovements } from "@/lib/products/stock-movements";

type LegacySaleItem = {
  type?: string;
  item_id?: string | null;
  product_variant_id?: string | null;
  name?: string;
  quantity?: number;
  unit_price?: number;
};

export type CreateWalkInOrderFromLegacySaleInput = {
  supabase: SupabaseClient;
  providerId: string;
  userId: string;
  locationId?: string | null;
  customerId?: string | null;
  items: LegacySaleItem[];
  subtotal?: number;
  taxRate?: number;
  taxAmount?: number;
  discountAmount?: number;
  totalAmount: number;
  paymentMethod: string;
  paymentStatus?: string;
  paymentReference?: string | null;
  notes?: string | null;
  legacySaleId?: string | null;
  tenantId: string;
};

export function isProductOnlyLegacySale(items: LegacySaleItem[]): boolean {
  if (!items.length) return false;
  return items.every(
    (item) =>
      (item.type === "product" || !item.type) &&
      typeof item.item_id === "string" &&
      item.item_id.length > 0,
  );
}

function mapPaymentProvider(method: string): {
  orderMethod: string;
  ledgerProvider: "paystack" | "wallet" | "cash" | "yoco" | "card_on_delivery";
} {
  const m = String(method || "cash").toLowerCase();
  if (m === "yoco") return { orderMethod: "yoco", ledgerProvider: "yoco" };
  if (m === "paystack") return { orderMethod: "paystack", ledgerProvider: "paystack" };
  if (m === "gift_card") return { orderMethod: "gift_card", ledgerProvider: "paystack" };
  if (m === "card") return { orderMethod: "card", ledgerProvider: "card_on_delivery" };
  return { orderMethod: m === "cash" ? "cash" : "other", ledgerProvider: "cash" };
}

export async function createWalkInOrderFromLegacySale(
  input: CreateWalkInOrderFromLegacySaleInput,
): Promise<{ orderId: string; orderNumber: string }> {
  const {
    supabase,
    providerId,
    userId,
    locationId = null,
    customerId = null,
    items,
    taxRate = 0,
    taxAmount,
    discountAmount = 0,
    totalAmount,
    paymentMethod,
    paymentStatus = "completed",
    paymentReference = null,
    legacySaleId = null,
    tenantId,
  } = input;

  const posItems = items.map((item) => ({
    type: "product" as const,
    item_id: item.item_id!,
    product_variant_id: item.product_variant_id ?? null,
    quantity: item.quantity ?? 1,
  }));

  const stockError = await validatePosProductStock(supabase, providerId, posItems);
  if (stockError) throw new Error(stockError);

  const productIds = [...new Set(posItems.map((i) => i.item_id))];
  const { data: products, error: prodErr } = await supabase
    .from("products")
    .select("id, name, image_urls, retail_price, is_active")
    .in("id", productIds)
    .eq("provider_id", providerId);
  if (prodErr) throw prodErr;

  type ProductRow = {
    id: string;
    name: string;
    image_urls?: string[] | null;
    retail_price: string;
    is_active?: boolean | null;
  };
  const productMap = new Map<string, ProductRow>((products ?? []).map((p: ProductRow) => [p.id, p]));

  let subtotal = 0;
  let computedTax = 0;
  const orderItems: Array<{
    product_id: string;
    product_variant_id: string | null;
    product_name: string;
    product_image_url: string | null;
    quantity: number;
    unit_price: number;
    total_price: number;
  }> = [];

  for (const item of items) {
    const prod = productMap.get(item.item_id!);
    if (!prod || prod.is_active === false) {
      throw new Error(`Product not found or inactive: ${item.item_id}`);
    }
    const qty = Math.max(1, Number(item.quantity ?? 1));
    const unitPrice = Number(item.unit_price ?? prod.retail_price ?? 0);
    const lineTotal = unitPrice * qty;
    const lineTax = percentOf(lineTotal, Number.isFinite(taxRate) ? taxRate : 0);
    subtotal += lineTotal;
    computedTax += lineTax;
    orderItems.push({
      product_id: prod.id,
      product_variant_id: item.product_variant_id ?? null,
      product_name: item.name?.trim() || prod.name,
      product_image_url: prod.image_urls?.[0] ?? null,
      quantity: qty,
      unit_price: unitPrice,
      total_price: lineTotal,
    });
  }

  const resolvedTax = taxAmount ?? computedTax;
  const resolvedSubtotal = input.subtotal ?? subtotal;
  const resolvedTotal = totalAmount;
  const { orderMethod, ledgerProvider } = mapPaymentProvider(paymentMethod);
  const isPaid = paymentStatus === "completed";

  const { data: seqData } = await supabase.rpc("nextval", { seq_name: "product_order_number_seq" });
  const orderNum = `BO-W${seqData ?? Date.now()}`;

  const { data: order, error: orderErr } = await supabase
    .from("product_orders")
    .insert({
      tenant_id: tenantId,
      order_number: orderNum,
      customer_id: customerId ?? null,
      provider_id: providerId,
      fulfillment_type: "collection",
      collection_location_id: locationId,
      subtotal: resolvedSubtotal.toFixed(2),
      tax_amount: resolvedTax.toFixed(2),
      discount_amount: Number(discountAmount || 0).toFixed(2),
      delivery_fee: "0.00",
      platform_fee: "0.00",
      total_amount: resolvedTotal.toFixed(2),
      payment_method: orderMethod,
      payment_reference: paymentReference,
      payment_status: isPaid ? "paid" : "pending",
      status: isPaid ? "delivered" : "confirmed",
      order_source: "walk_in",
      staff_id: userId,
      legacy_sale_id: legacySaleId,
      confirmed_at: new Date().toISOString(),
      delivered_at: isPaid ? new Date().toISOString() : null,
      paid_at: isPaid ? new Date().toISOString() : null,
    })
    .select("id, order_number")
    .single();

  if (orderErr || !order) throw orderErr ?? new Error("Failed to create walk-in product order");

  const itemsToInsert = orderItems.map((oi) => ({
    order_id: order.id,
    product_id: oi.product_id,
    product_variant_id: oi.product_variant_id,
    product_name: oi.product_name,
    product_image_url: oi.product_image_url,
    quantity: oi.quantity,
    unit_price: oi.unit_price.toFixed(2),
    total_price: oi.total_price.toFixed(2),
  }));

  const { error: insertErr } = await supabase.from("product_order_items").insert(itemsToInsert);
  if (insertErr) {
    await supabase.from("product_orders").delete().eq("id", order.id);
    throw insertErr;
  }

  if (isPaid) {
    await applyPosProductStockDecrements(supabase, posItems);
    try {
      await logSaleStockMovements(supabase, {
        providerId,
        referenceId: order.id,
        actorUserId: userId,
        lines: orderItems.map((oi) => ({
          productId: oi.product_id,
          productVariantId: oi.product_variant_id,
          quantity: oi.quantity,
        })),
      });
    } catch (logErr) {
      console.error("[legacy-sale-adapter] stock movement log failed:", logErr);
    }

    try {
      await recordProductOrderPayment({
        supabase: getSupabaseAdmin() as never,
        productOrderId: order.id,
        reference: paymentReference?.trim() || `walk_in_legacy_${order.id}`,
        amountMajor: resolvedTotal,
        feesMajor: 0,
        source: "walk_in_pos",
        provider: ledgerProvider,
      });
    } catch (ledgerErr) {
      console.error("[legacy-sale-adapter] ledger write failed:", ledgerErr);
    }
  }

  return { orderId: order.id, orderNumber: String(order.order_number ?? orderNum) };
}
