import type { SupabaseClient } from "@supabase/supabase-js";
import { convertFromSmallestUnit } from "@/lib/payments/paystack-complete";
import { refundGatewayCharge } from "@/lib/payments/refund-gateway-charge";

export type StaleCustomOfferRefundInput = {
  offerId: string;
  reference: string;
  /** Paystack charge amount in smallest currency unit when known. */
  amountMinor?: number | null;
  currency?: string | null;
  offerStatus?: string | null;
  finalizeReason?: string | null;
  tenantId?: string | null;
};

/**
 * When a Paystack charge succeeds but finalize cannot run (offer no longer
 * `payment_pending`), refund the card leg and record idempotently in
 * `stale_payment_refunds`.
 */
export async function autoRefundStaleCustomOfferPayment(
  admin: SupabaseClient,
  input: StaleCustomOfferRefundInput,
): Promise<{ refunded: boolean; skipped?: string }> {
  const reference = input.reference?.trim();
  const offerId = input.offerId?.trim();
  if (!reference || !offerId) return { refunded: false, skipped: "missing_ids" };

  const currency = input.currency ?? "ZAR";

  const { data: existing } = await admin
    .from("stale_payment_refunds")
    .select("id, refund_status")
    .eq("source_type", "custom_offer")
    .eq("source_id", offerId)
    .eq("payment_reference", reference)
    .maybeSingle();

  const existingRow = existing as { id?: string; refund_status?: string } | null;
  if (existingRow?.refund_status === "completed") {
    return { refunded: false, skipped: "already_refunded" };
  }

  let rowId = existingRow?.id ?? null;
  if (!rowId) {
    const { data: inserted, error: insertErr } = await admin
      .from("stale_payment_refunds")
      .insert({
        source_type: "custom_offer",
        source_id: offerId,
        payment_reference: reference,
        amount_minor: input.amountMinor ?? null,
        currency,
        offer_status: input.offerStatus ?? null,
        reason: input.finalizeReason ?? "stale_custom_offer_payment",
        refund_status: "pending",
        tenant_id: input.tenantId ?? null,
      })
      .select("id")
      .maybeSingle();
    if (insertErr || !inserted) {
      console.error("[autoRefundStaleCustomOfferPayment] insert failed:", insertErr);
      return { refunded: false, skipped: "insert_failed" };
    }
    rowId = String((inserted as { id: string }).id);
  }

  const amountMajor = staleCustomOfferRefundAmountMajor(input.amountMinor, currency);
  if (amountMajor == null || amountMajor <= 0) {
    return { refunded: false, skipped: "missing_amount" };
  }

  const { data: claimed, error: claimErr } = await admin
    .from("stale_payment_refunds")
    .select("id, attempt_count, refund_status")
    .eq("id", rowId)
    .in("refund_status", ["pending", "failed"])
    .maybeSingle();

  if (claimErr || !claimed) {
    return { refunded: false, skipped: "not_claimable" };
  }

  const priorAttempts = Number((claimed as { attempt_count?: number }).attempt_count ?? 0);
  await admin
    .from("stale_payment_refunds")
    .update({
      attempt_count: priorAttempts + 1,
      last_attempt_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", rowId);

  try {
    const result = await refundGatewayCharge({
      reference,
      amountMajor,
      currency,
      tenantId: input.tenantId ?? null,
      reason: input.finalizeReason ?? "stale_custom_offer_payment",
      idempotencyKey: `stale-refund:${rowId}`,
    });
    await admin
      .from("stale_payment_refunds")
      .update({
        refund_status: "completed",
        paystack_refund_reference: result.refundId ?? reference,
        failure_reason: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", rowId);
    return { refunded: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await admin
      .from("stale_payment_refunds")
      .update({
        refund_status: "failed",
        failure_reason: msg.slice(0, 500),
        updated_at: new Date().toISOString(),
      })
      .eq("id", rowId);
    console.error("[autoRefundStaleCustomOfferPayment] refundGatewayCharge failed:", err);
    return { refunded: false, skipped: "refund_failed" };
  }
}

export function staleCustomOfferRefundAmountMajor(
  amountMinor: number | null | undefined,
  currency: string | null | undefined,
): number | null {
  if (typeof amountMinor !== "number" || !Number.isFinite(amountMinor)) return null;
  return convertFromSmallestUnit(amountMinor, currency ?? "ZAR");
}
