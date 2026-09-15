/**
 * Booking chargeback clawback — inserts a completed booking_refunds row so the
 * DB trigger writes proportional finance_transactions clawback rows. Does NOT
 * credit the customer wallet (PSP reversed funds to the card/bank directly).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { convertFromSmallestUnit } from "@/lib/payments/paystack";
import { resolveBookingPaymentIdForRefund } from "@/lib/bookings/resolve-booking-refund-payment-id";
import { syncPaymentTransactionRefundState } from "@/lib/finance/sync-payment-transaction-refund";
import { logger } from "@/lib/utils/logger";

/** Payment kinds handled by dedicated dispute reversal helpers — not booking chargebacks. */
export const PLATFORM_BILLING_PAYMENT_KINDS = new Set([
  "marketing_credit_topup",
  "ads_budget_order",
  "provider_subscription_order",
  "subscription_authorization",
  "subscription_renewal",
  "membership_purchase",
  "membership_renewal",
  "wallet_topup",
  "gift_card_order",
  "gift_card_purchase",
  "product_order",
  "terminal_sale",
]);

export function isPlatformBillingPaymentKind(kind: unknown): boolean {
  if (typeof kind !== "string" || !kind.trim()) return false;
  return PLATFORM_BILLING_PAYMENT_KINDS.has(kind.trim());
}

/**
 * Paystack dispute.* events that should create a booking chargeback clawback.
 * Skips remind-only noise and merchant-won resolutions.
 */
export function shouldProcessPaystackDisputeChargeback(
  eventType: string,
  disputeData: Record<string, unknown> | null | undefined,
): boolean {
  if (eventType === "dispute.create") return true;
  if (eventType === "dispute.resolve") {
    const resolution = String(disputeData?.resolution ?? "").toLowerCase();
    if (
      resolution.includes("merchant") &&
      (resolution.includes("accepted") || resolution.includes("won") || resolution.includes("declined"))
    ) {
      return false;
    }
    return true;
  }
  return false;
}

export type ProcessBookingChargebackParams = {
  supabase: SupabaseClient;
  paymentProvider: "paystack" | "stripe";
  reference: string;
  /** Stable PSP dispute id for idempotency (Paystack dispute id, Stripe dp_*) */
  disputeId: string;
  eventType?: string;
  /** Major currency units when known; otherwise derived from payment_transactions.amount */
  amountMajor?: number;
  /** Paystack amounts may be in kobo when amountMajor omitted */
  amountSmallestUnit?: number;
};

export type ProcessBookingChargebackResult = {
  processed: boolean;
  reason?: string;
  refundId?: string;
  amount?: number;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function chargebackRefundProviderId(
  paymentProvider: string,
  disputeId: string,
): string {
  return `chargeback:${paymentProvider}:${disputeId}`;
}

export async function processBookingChargeback(
  params: ProcessBookingChargebackParams,
): Promise<ProcessBookingChargebackResult> {
  const reference = params.reference.trim();
  const disputeId = params.disputeId.trim();
  if (!reference || !disputeId) {
    return { processed: false, reason: "missing_reference_or_dispute_id" };
  }

  const idempotencyKey = chargebackRefundProviderId(params.paymentProvider, disputeId);

  const { data: existingRefund } = await params.supabase
    .from("booking_refunds")
    .select("id, amount")
    .eq("refund_provider_id", idempotencyKey)
    .maybeSingle();

  if (existingRefund) {
    return {
      processed: true,
      reason: "already_recorded",
      refundId: (existingRefund as { id: string }).id,
      amount: Number((existingRefund as { amount?: number }).amount ?? 0),
    };
  }

  const { data: txn } = await params.supabase
    .from("payment_transactions")
    .select("id, booking_id, amount, metadata")
    .eq("reference", reference)
    .eq("provider", params.paymentProvider)
    .in("status", ["success", "partially_refunded"])
    .maybeSingle();

  const bookingId = (txn as { booking_id?: string | null } | null)?.booking_id ?? null;
  if (!bookingId) {
    return { processed: false, reason: "not_booking_payment" };
  }

  const meta = ((txn as { metadata?: Record<string, unknown> } | null)?.metadata ??
    {}) as Record<string, unknown>;
  if (isPlatformBillingPaymentKind(meta.kind)) {
    return { processed: false, reason: "platform_billing_kind" };
  }

  let refundAmount = params.amountMajor;
  if (refundAmount == null && params.amountSmallestUnit != null) {
    refundAmount = convertFromSmallestUnit(Number(params.amountSmallestUnit));
  }
  if (refundAmount == null || !Number.isFinite(refundAmount) || refundAmount <= 0) {
    refundAmount = Number((txn as { amount?: number }).amount ?? 0);
  }
  refundAmount = round2(Math.max(0, refundAmount));
  if (refundAmount <= 0) {
    return { processed: false, reason: "zero_amount" };
  }

  const { data: booking } = await params.supabase
    .from("bookings")
    .select("total_paid, total_refunded, currency")
    .eq("id", bookingId)
    .maybeSingle();

  const totalPaid = Number((booking as { total_paid?: number } | null)?.total_paid ?? 0);
  const totalRefunded = Number((booking as { total_refunded?: number } | null)?.total_refunded ?? 0);
  const remaining = round2(Math.max(0, totalPaid - totalRefunded));
  refundAmount = round2(Math.min(refundAmount, remaining > 0 ? remaining : refundAmount));

  const bookingPaymentId = await resolveBookingPaymentIdForRefund(
    params.supabase,
    bookingId,
    reference,
  );

  const reason = `PSP chargeback (${params.paymentProvider})${params.eventType ? `: ${params.eventType}` : ""}`;

  const { data: inserted, error: insertError } = await params.supabase
    .from("booking_refunds")
    .insert({
      booking_id: bookingId,
      payment_id: bookingPaymentId,
      amount: refundAmount,
      reason,
      refund_method: "original",
      refund_provider_id: idempotencyKey,
      status: "completed",
      notes:
        "Auto-created by chargeback handler — ledger clawback via booking_refunds trigger; no wallet credit (PSP reversed to customer card/bank).",
    })
    .select("id")
    .single();

  if (insertError) {
    logger.error("processBookingChargeback.insert_failed", insertError, {
      bookingId,
      reference,
      disputeId,
    });
    return { processed: false, reason: "insert_failed" };
  }

  const refundId = (inserted as { id: string }).id;

  try {
    const { data: allRefunds } = await params.supabase
      .from("booking_refunds")
      .select("amount, refund_method, status")
      .eq("booking_id", bookingId);
    const cumulative = (allRefunds ?? [])
      .filter((r) => {
        const st = String((r as { status?: string }).status ?? "").toLowerCase();
        return st === "completed" || st === "pending";
      })
      .reduce((sum, r) => sum + Number((r as { amount?: number }).amount ?? 0), 0);

    await syncPaymentTransactionRefundState({
      supabase: params.supabase,
      bookingId,
      cumulativeRefundAmount: round2(cumulative),
      reason,
    });
  } catch (syncErr) {
    logger.warn("processBookingChargeback.sync_payment_tx_failed", {
      bookingId,
      error: syncErr instanceof Error ? syncErr.message : String(syncErr),
    });
  }

  try {
    await params.supabase.from("booking_events").insert({
      booking_id: bookingId,
      event_type: "chargeback_recorded",
      event_data: {
        refund_id: refundId,
        amount: refundAmount,
        payment_provider: params.paymentProvider,
        reference,
        dispute_id: disputeId,
      },
    });
  } catch {
    // non-blocking audit trail
  }

  return { processed: true, refundId, amount: refundAmount };
}
