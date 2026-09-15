import type { SupabaseClient } from "@supabase/supabase-js";
import {
  parseRefundAmount,
  sumCompletedStoreCreditRefunds,
  type BookingRefundSummary,
} from "@/lib/admin/booking-refund-context";
import { syncPaymentTransactionRefundState } from "@/lib/finance/sync-payment-transaction-refund";

export type BookingRefundCoverage = {
  walletCreditedTotal: number;
  bookingTotalRefunded: number;
  effectiveRefundedTotal: number;
  bookingRefunds: BookingRefundSummary[];
  /** Gift card voided via redemption restore — display only, not wallet coverage. */
  giftCardVoidedTotal: number;
  /** Cancellation / no-show fee retained — display only, not wallet coverage. */
  retainedFeeTotal: number;
  /** Pending refunds (cash confirm, stuck store_credit) — reserved, not coverage. */
  reservedPendingTotal: number;
};

export async function loadBookingRefundCoverage(
  supabase: SupabaseClient,
  bookingId: string,
): Promise<BookingRefundCoverage> {
  const [
    { data: booking },
    { data: bookingRefunds },
    { data: voidedGift },
    { data: feeRows },
  ] = await Promise.all([
    supabase
      .from("bookings")
      .select("total_refunded, gift_card_amount")
      .eq("id", bookingId)
      .maybeSingle(),
    supabase
      .from("booking_refunds")
      .select(
        "id, booking_id, amount, reason, refund_method, status, notes, created_at, created_by, customer_confirmation_required, confirmation_deadline_at",
      )
      .eq("booking_id", bookingId)
      .order("created_at", { ascending: false }),
    supabase
      .from("gift_card_redemptions")
      .select("amount")
      .eq("booking_id", bookingId)
      .eq("status", "voided")
      .maybeSingle(),
    supabase
      .from("finance_transactions")
      .select("amount")
      .eq("booking_id", bookingId)
      .eq("transaction_type", "cancellation_fee"),
  ]);

  const refunds = (bookingRefunds ?? []) as BookingRefundSummary[];
  const walletFromRefunds = sumCompletedStoreCreditRefunds(refunds);
  const bookingTotalRefunded = parseRefundAmount(
    (booking as { total_refunded?: unknown } | null)?.total_refunded,
  );
  const walletCreditedTotal = Math.max(walletFromRefunds, bookingTotalRefunded);
  const effectiveRefundedTotal = walletCreditedTotal;

  const giftCardVoidedTotal = parseRefundAmount(
    (voidedGift as { amount?: unknown } | null)?.amount ??
      (booking as { gift_card_amount?: unknown } | null)?.gift_card_amount,
  );

  const retainedFeeTotal = (feeRows ?? []).reduce(
    (sum, row) => sum + parseRefundAmount((row as { amount?: unknown }).amount),
    0,
  );

  const reservedPendingTotal = (refunds ?? [])
    .filter((r) => String(r.status ?? "") === "pending")
    .reduce((sum, r) => sum + parseRefundAmount(r.amount), 0);

  return {
    walletCreditedTotal,
    bookingTotalRefunded,
    effectiveRefundedTotal,
    bookingRefunds: refunds,
    giftCardVoidedTotal,
    retainedFeeTotal,
    reservedPendingTotal,
  };
}

export type BackfillPaymentTransactionRefundOptions = {
  supabase: SupabaseClient;
  bookingId: string;
  transactionId: string;
  txnAmount: number;
  txnRefundedAmount: number;
  coverage: BookingRefundCoverage;
};

/**
 * When wallet was credited elsewhere but payment_transactions is stale, align
 * all charge rows without issuing a new wallet credit.
 */
export async function backfillPaymentTransactionFromBookingRefunds(
  opts: BackfillPaymentTransactionRefundOptions,
): Promise<boolean> {
  const { supabase, bookingId, coverage } = opts;

  if (coverage.walletCreditedTotal <= opts.txnRefundedAmount + 0.001) {
    return false;
  }

  const latest = coverage.bookingRefunds.find(
    (r) =>
      String(r.status ?? "") === "completed" &&
      String(r.refund_method ?? "store_credit") === "store_credit",
  );
  const reason = latest?.reason ?? "Wallet refund recorded on booking";

  const result = await syncPaymentTransactionRefundState({
    supabase,
    bookingId,
    cumulativeRefundAmount: coverage.walletCreditedTotal,
    reason,
    actorUserId: null,
  });

  return result.synced;
}
