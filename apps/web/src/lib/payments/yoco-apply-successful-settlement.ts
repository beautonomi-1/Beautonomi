import type { SupabaseClient } from "@supabase/supabase-js";
import { applyPosProductStockDecrements } from "@/lib/provider-sales/pos-product-stock";
import { convertFromSmallestUnit } from "@/lib/payments/paystack";
import { resolveYocoSettleEntity, settleYocoPayment } from "@/lib/payments/settle-yoco-payment";

export type YocoPaymentRowForSettle = {
  id?: string | null;
  sale_id?: string | null;
  device_id?: string | null;
  amount?: number | null;
  provider_id?: string | null;
  appointment_id?: string | null;
  tip_amount?: number | null;
  entity_type?: string | null;
  entity_id?: string | null;
  group_booking_id?: string | null;
  metadata?: Record<string, unknown> | null;
  currency?: string | null;
};

/**
 * Idempotently complete Beautonomi records after a successful Yoco Web POS capture.
 * Shared by webhook and GET payment poll so bookings/sales settle when webhooks fail.
 */
export async function applyYocoSuccessfulSettlement(
  supabase: SupabaseClient,
  options: {
    yocoPaymentId: string;
    existingPayment: YocoPaymentRowForSettle | null;
    metadata: Record<string, unknown>;
    amountCents: number;
    currency: string;
  },
): Promise<void> {
  const { yocoPaymentId, existingPayment, metadata, amountCents, currency } = options;
  const mergedMeta = {
    ...(existingPayment?.metadata ?? {}),
    ...metadata,
  };

  const saleId =
    (mergedMeta.sale_id as string | undefined) ?? existingPayment?.sale_id ?? null;

  if (saleId) {
    const { data: saleBefore } = await supabase
      .from("sales")
      .select("id, payment_status")
      .eq("id", saleId)
      .maybeSingle();
    const shouldDecrementStock =
      (saleBefore as { payment_status?: string } | null)?.payment_status !== "completed";

    const { error: saleError } = await supabase
      .from("sales")
      .update({
        payment_status: "completed",
        payment_provider: "yoco",
        payment_provider_id: yocoPaymentId,
        payment_method: "yoco",
        updated_at: new Date().toISOString(),
      })
      .eq("id", saleId)
      .neq("payment_status", "completed");
    if (saleError) {
      console.error("Yoco settle: failed to mark POS sale completed:", saleError);
      throw new Error(
        `Failed to complete POS sale for Yoco payment ${yocoPaymentId}: ${saleError.message}`,
      );
    }
    if (shouldDecrementStock) {
      const { data: saleItems } = await supabase
        .from("sale_items")
        .select("item_type, item_id, product_variant_id, quantity")
        .eq("sale_id", saleId);
      const stockItems = (saleItems || []).map((row: Record<string, unknown>) => ({
        type: row.item_type as string,
        item_id: (row.item_id as string | null) ?? null,
        product_variant_id: (row.product_variant_id as string | null) ?? null,
        quantity: Number(row.quantity ?? 1),
      }));
      try {
        await applyPosProductStockDecrements(supabase, stockItems);
      } catch (stockError) {
        console.error("Yoco settle: POS sale completed but stock decrement failed:", stockError);
      }
    }
  }

  const settleEntity = resolveYocoSettleEntity({
    entity_type: existingPayment?.entity_type,
    entity_id: existingPayment?.entity_id,
    appointment_id:
      existingPayment?.appointment_id ?? (mergedMeta.appointment_id as string | undefined),
    sale_id: existingPayment?.sale_id ?? (mergedMeta.sale_id as string | undefined),
    group_booking_id: existingPayment?.group_booking_id,
    metadata: mergedMeta,
  });

  if (settleEntity && settleEntity.entityType !== "sale") {
    const amountInCurrency = convertFromSmallestUnit(amountCents, currency);
    const tipFromColumn = Number(existingPayment?.tip_amount ?? 0);
    const tipFromMeta = Number(mergedMeta.tip_amount ?? 0);
    const tipAmount = Math.max(0, tipFromColumn > 0 ? tipFromColumn : tipFromMeta);
    const settleResult = await settleYocoPayment(supabase, {
      paymentId: String(existingPayment?.id ?? yocoPaymentId),
      providerId: String(existingPayment?.provider_id ?? mergedMeta.provider_id),
      entityType: settleEntity.entityType,
      entityId: settleEntity.entityId,
      amount: amountInCurrency,
      yocoPaymentId,
      processedBy:
        typeof mergedMeta.processed_by === "string" ? mergedMeta.processed_by : null,
      currency,
      tipAmount,
    });
    if (!settleResult.settled && settleResult.reason) {
      console.warn(`Yoco settle skipped/failed for ${yocoPaymentId}: ${settleResult.reason}`);
    }
  }
}
