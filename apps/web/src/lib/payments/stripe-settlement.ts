import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getCurrencyMeta } from "@beautonomi/utils";
import { convertFromSmallestUnit } from "@/lib/payments/paystack";
import {
  applyGatewayFeeCorrection,
  findChargeFinanceRowForFeePatch,
} from "@/lib/payments/gateway-fee-correction";
import {
  feeMinorFromExpandedCharge,
  retrieveStripeFeeMinorForCharge,
} from "@/lib/payments/stripe-balance-fee";
import { resolveStripeGatewayFees } from "@/lib/payments/resolve-gateway-fees";
import { resolveBookingPaymentIdForRefund } from "@/lib/bookings/resolve-booking-refund-payment-id";
import { syncPaymentTransactionRefundState } from "@/lib/finance/sync-payment-transaction-refund";
import { reverseCompletedPayoutLedger } from "@/app/api/payments/webhook/_handlers/transfer-events";
import { recordFailedPayoutTransferFee } from "@/lib/provider/record-payout-ledger";
import { applyNonBookingRefundFromTransaction } from "@/lib/payments/apply-non-booking-refund-from-transaction";

type StripeChargeLike = {
  id?: string;
  payment_intent?: string;
  amount?: number;
  amount_refunded?: number;
  currency?: string;
  metadata?: Record<string, unknown> & {
    booking_id?: string;
    reference?: string;
    tenant_id?: string;
  };
  balance_transaction?: { fee?: number } | string | null;
};

type StripeRefundLike = {
  id?: string;
  charge?: string;
  payment_intent?: string;
  amount?: number;
  currency?: string;
  metadata?: Record<string, unknown>;
};

type StripeDisputeLike = {
  id?: string;
  charge?: string;
  payment_intent?: string;
  amount?: number;
  currency?: string;
  status?: string;
  metadata?: Record<string, unknown>;
};

type StripeTransferLike = {
  id?: string;
  amount?: number;
  currency?: string;
  reversed?: boolean;
  metadata?: Record<string, unknown> & { payout_id?: string };
};

function stripeMinorToMajor(amountMinor: number | undefined, currency: string): number {
  const factor = 10 ** getCurrencyMeta(currency).minorUnits;
  return Math.round((Number(amountMinor || 0) / factor) * 100) / 100;
}

type PaymentTxnRow = {
  id?: string;
  booking_id?: string | null;
  amount?: number | null;
  metadata?: Record<string, unknown> | null;
  provider?: string | null;
};

async function resolveStripeChargePaymentTransaction(
  supabase: SupabaseClient,
  reference: string,
): Promise<PaymentTxnRow | null> {
  const baseQuery = () =>
    supabase
      .from("payment_transactions")
      .select("id, booking_id, amount, metadata, provider")
      .eq("reference", reference)
      .in("status", ["success", "partially_refunded"]);

  const { data: stripeTxn } = await baseQuery().eq("provider", "stripe").maybeSingle();
  if (stripeTxn) return stripeTxn as PaymentTxnRow;

  const { data: anyTxn } = await baseQuery().maybeSingle();
  return (anyTxn as PaymentTxnRow | null) ?? null;
}

async function removeStripeChargeRefundedBackstopRows(
  supabase: SupabaseClient,
  bookingId: string,
): Promise<void> {
  const { data: rows } = await supabase
    .from("booking_refunds")
    .select("id, refund_provider_id")
    .eq("booking_id", bookingId)
    .eq("status", "completed");

  for (const raw of rows ?? []) {
    const pid = String((raw as { refund_provider_id?: string }).refund_provider_id ?? "");
    if (!pid.startsWith("stripe_charge_refunded:")) continue;
    await supabase.from("booking_refunds").delete().eq("id", (raw as { id: string }).id);
  }
}

function chargeReference(charge: StripeChargeLike): string | null {
  const metaRef =
    typeof charge.metadata?.reference === "string" ? charge.metadata.reference.trim() : "";
  if (metaRef) return metaRef;
  if (typeof charge.payment_intent === "string" && charge.payment_intent.trim()) {
    return charge.payment_intent.trim();
  }
  if (typeof charge.id === "string" && charge.id.trim()) return charge.id.trim();
  return null;
}

async function applyStripeChargeFeeCorrection(
  supabase: SupabaseClient,
  charge: StripeChargeLike,
): Promise<void> {
  const reference = chargeReference(charge);
  if (!reference) return;

  let feeMinor = feeMinorFromExpandedCharge(charge);
  if (feeMinor <= 0 && typeof charge.id === "string") {
    const tenantId =
      typeof charge.metadata?.tenant_id === "string" ? charge.metadata.tenant_id : null;
    feeMinor = await retrieveStripeFeeMinorForCharge(charge.id, tenantId);
  }

  const currency = (charge.currency || "ZAR").toUpperCase();
  const resolved = resolveStripeGatewayFees({ feeMinor, currency });
  const bookingId =
    typeof charge.metadata?.booking_id === "string" ? charge.metadata.booking_id : null;
  const productOrderId =
    typeof charge.metadata?.product_order_id === "string" ? charge.metadata.product_order_id : null;

  const financeRow = await findChargeFinanceRowForFeePatch(supabase, reference, bookingId, productOrderId);
  if (!financeRow) return;

  await applyGatewayFeeCorrection(supabase, {
    financeTxId: financeRow.id,
    newFeeMajor: resolved.feesMajor,
    feeSource: resolved.feeSource,
    chargeReference: reference,
    bookingId,
  });
}

/** Stripe `charge.updated` — apply PSP fee when balance_transaction fee arrives late. */
export async function handleStripeChargeUpdated(charge: StripeChargeLike): Promise<void> {
  const supabase = getSupabaseAdmin();
  await applyStripeChargeFeeCorrection(supabase, charge);
}

/** Stripe `refund.created` — mirror Paystack refund.processed ledger paths. */
export async function handleStripeRefundCreated(refund: StripeRefundLike): Promise<void> {
  const supabase = getSupabaseAdmin();
  const refundId = typeof refund.id === "string" ? refund.id.trim() : "";
  if (!refundId) return;

  const reference =
    typeof refund.payment_intent === "string" && refund.payment_intent.trim()
      ? refund.payment_intent.trim()
      : typeof refund.charge === "string"
        ? refund.charge.trim()
        : "";
  if (!reference) return;

  const currency = (refund.currency || "ZAR").toUpperCase();
  const refundAmount = stripeMinorToMajor(refund.amount, currency);
  if (refundAmount <= 0) return;

  const { data: existingRefund } = await supabase
    .from("payment_transactions")
    .select("id")
    .eq("reference", refundId)
    .eq("transaction_type", "refund")
    .maybeSingle();
  if (existingRefund) return;

  const txn = await resolveStripeChargePaymentTransaction(supabase, reference);

  await supabase.from("payment_transactions").insert({
    booking_id: txn?.booking_id || null,
    reference: refundId,
    amount: refundAmount,
    fees: 0,
    net_amount: refundAmount,
    status: "refunded",
    provider: "stripe",
    transaction_type: "refund",
    metadata: {
      original_reference: reference,
      stripe_refund_id: refundId,
      stripe_charge_id: refund.charge ?? null,
    },
    created_at: new Date().toISOString(),
  });

  if (txn?.booking_id) {
    const bookingPaymentId = await resolveBookingPaymentIdForRefund(
      supabase,
      txn.booking_id,
      reference,
    );
    const { data: existingBookingRefund } = await supabase
      .from("booking_refunds")
      .select("id")
      .eq("refund_provider_id", refundId)
      .maybeSingle();
    if (!existingBookingRefund) {
      await removeStripeChargeRefundedBackstopRows(supabase, txn.booking_id);
      await supabase.from("booking_refunds").insert({
        booking_id: txn.booking_id,
        payment_id: bookingPaymentId,
        amount: refundAmount,
        reason: `Stripe refund: ${reference}`,
        refund_method: "original",
        refund_provider_id: refundId,
        status: "completed",
        notes: "Auto-created by Stripe refund.created handler",
      });
    }
  } else if (txn) {
    await applyNonBookingRefundFromTransaction({
      supabase,
      reference,
      refundAmountMajor: refundAmount,
      refundReference: refundId,
      txn,
      reason: "stripe_refund.created",
    });
  }

  if (txn?.booking_id) {
    const { data: refundRows } = await supabase
      .from("booking_refunds")
      .select("amount")
      .eq("booking_id", txn.booking_id);
    const cumulativeRefundAmount = (refundRows ?? []).reduce(
      (sum, row) => sum + Number((row as { amount?: number }).amount ?? 0),
      0,
    );
    await syncPaymentTransactionRefundState({
      supabase,
      bookingId: txn.booking_id,
      cumulativeRefundAmount,
      reason: "stripe_refund",
    });
  }

  void import("@/lib/integrations/slack/ops-triggers")
    .then(({ slackNotifyHighValueRefund }) =>
      slackNotifyHighValueRefund({
        refundId,
        bookingId: txn?.booking_id ?? null,
        amountMajor: refundAmount,
        currency,
        stage: "processed",
        reason: "stripe.refund.created",
      }),
    )
    .catch(() => undefined);
}

/** Backstop when only `charge.refunded` is configured — idempotent booking_refunds row. */
export async function handleStripeChargeRefundedBackstop(charge: StripeChargeLike): Promise<void> {
  const supabase = getSupabaseAdmin();
  const bookingId =
    typeof charge.metadata?.booking_id === "string" ? charge.metadata.booking_id.trim() : "";
  if (!bookingId) return;

  const currency = (charge.currency || "ZAR").toUpperCase();
  const refundMajor = stripeMinorToMajor(charge.amount_refunded, currency);
  if (refundMajor <= 0) return;

  const refundProviderId =
    typeof charge.payment_intent === "string" && charge.payment_intent.trim()
      ? `stripe_charge_refunded:${charge.payment_intent}`
      : typeof charge.id === "string"
        ? `stripe_charge_refunded:${charge.id}`
        : null;
  if (!refundProviderId) return;

  const { data: existing } = await supabase
    .from("booking_refunds")
    .select("id")
    .eq("booking_id", bookingId)
    .eq("refund_provider_id", refundProviderId)
    .maybeSingle();
  if (existing) return;

  const { data: priorRefunds } = await supabase
    .from("booking_refunds")
    .select("amount, refund_provider_id")
    .eq("booking_id", bookingId)
    .eq("status", "completed");

  if (
    (priorRefunds ?? []).some((row) =>
      String((row as { refund_provider_id?: string }).refund_provider_id ?? "").startsWith("re_"),
    )
  ) {
    return;
  }

  const alreadyRecorded = (priorRefunds ?? []).reduce((sum, row) => {
    const r = row as { amount?: number; refund_provider_id?: string | null };
    const pid = String(r.refund_provider_id ?? "");
    if (pid.startsWith("chargeback:")) return sum;
    return sum + Number(r.amount ?? 0);
  }, 0);

  const delta = Math.round((refundMajor - alreadyRecorded) * 100) / 100;
  if (delta <= 0) return;

  await supabase.from("booking_refunds").insert({
    booking_id: bookingId,
    amount: delta,
    reason: "stripe_charge_refunded_backstop",
    refund_method: "original",
    refund_provider_id: refundProviderId,
    status: "completed",
    notes: `Stripe charge.refunded backstop (${currency}); cumulative=${refundMajor}, prior=${alreadyRecorded}`,
  });
}

/** Stripe `charge.dispute.funds_withdrawn` — customer won / funds debited. */
export async function handleStripeDisputeFundsWithdrawn(
  dispute: StripeDisputeLike,
  eventId?: string,
): Promise<void> {
  const disputeId = dispute.id?.trim();
  if (!disputeId) return;

  const supabase = getSupabaseAdmin();
  const reference =
    typeof dispute.payment_intent === "string"
      ? dispute.payment_intent
      : typeof dispute.charge === "string"
        ? dispute.charge
        : "";
  if (!reference) return;

  const amountMajor =
    dispute.amount != null && Number.isFinite(Number(dispute.amount))
      ? stripeMinorToMajor(Number(dispute.amount), dispute.currency || "ZAR")
      : 0;

  const { processBookingChargeback } = await import("@/lib/bookings/process-booking-chargeback");
  await processBookingChargeback({
    supabase,
    paymentProvider: "stripe",
    reference,
    disputeId,
    eventType: "charge.dispute.funds_withdrawn",
    amountMajor: amountMajor > 0 ? amountMajor : undefined,
  });

  const { upsertOpenPaymentDispute } = await import("@/lib/bookings/paystack-dispute-lifecycle");
  await upsertOpenPaymentDispute({
    supabase,
    paymentProvider: "stripe",
    disputeId,
    reference,
    amountMajor,
    currency: dispute.currency ? String(dispute.currency).toUpperCase() : "ZAR",
    status: "customer_won",
    resolution: dispute.status ?? "lost",
    rawPayload: { ...(dispute as Record<string, unknown>), event_id: eventId ?? null },
    bookingId: null,
    providerId: null,
    tenantId: null,
  });
}

/** Stripe Connect `transfer.reversed` — reverse payout ledger + mark payout failed. */
export async function handleStripeTransferReversed(transfer: StripeTransferLike): Promise<void> {
  const supabase = getSupabaseAdmin();
  const transferId = typeof transfer.id === "string" ? transfer.id.trim() : "";
  if (!transferId) return;

  const payoutId =
    typeof transfer.metadata?.payout_id === "string" ? transfer.metadata.payout_id.trim() : "";

  let payoutQuery = supabase.from("payouts").select("*");
  if (payoutId) {
    payoutQuery = payoutQuery.eq("id", payoutId);
  } else {
    payoutQuery = payoutQuery.eq("transfer_code", transferId);
  }
  const { data: payout } = await payoutQuery.maybeSingle();
  if (!payout) {
    console.log(`[stripe-settlement] no payout for reversed transfer ${transferId}`);
    return;
  }

  const payoutData = payout as {
    id: string;
    status: string;
    provider_id: string;
    amount?: number;
    net_amount?: number;
    payout_number?: string;
    currency?: string | null;
  };

  if (payoutData.status === "completed") {
    await reverseCompletedPayoutLedger(supabase, {
      payoutId: payoutData.id,
      reason: "stripe_transfer_reversed",
      event: "transfer.reversed",
    });
  }

  try {
    await recordFailedPayoutTransferFee(supabase, {
      id: payoutData.id,
      provider_id: payoutData.provider_id,
      amount: payoutData.amount ?? payoutData.net_amount ?? 0,
      payout_number: payoutData.payout_number,
      currency: payoutData.currency ?? null,
    });
  } catch (feeErr) {
    console.error("[stripe-settlement] recordFailedPayoutTransferFee:", feeErr);
  }

  await supabase
    .from("payouts")
    .update({
      status: "failed",
      failed_at: new Date().toISOString(),
      failure_reason: "Stripe transfer reversed",
      payout_provider: "stripe",
      updated_at: new Date().toISOString(),
    })
    .eq("id", payoutData.id);
}

/** @deprecated Use handleStripeChargeRefundedBackstop from stripe-settlement. */
export async function handleStripeChargeRefunded(charge: StripeChargeLike): Promise<void> {
  await handleStripeChargeRefundedBackstop(charge);
}
