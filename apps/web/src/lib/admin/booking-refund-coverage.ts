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
};

export async function loadBookingRefundCoverage(
  supabase: SupabaseClient,
  bookingId: string,
): Promise<BookingRefundCoverage> {
  const [{ data: booking }, { data: bookingRefunds }] = await Promise.all([
    supabase
      .from("bookings")
      .select("total_refunded")
      .eq("id", bookingId)
      .maybeSingle(),
    supabase
      .from("booking_refunds")
      .select(
        "id, booking_id, amount, reason, refund_method, status, notes, created_at, created_by",
      )
      .eq("booking_id", bookingId)
      .order("created_at", { ascending: false }),
  ]);

  const refunds = (bookingRefunds ?? []) as BookingRefundSummary[];
  const walletFromRefunds = sumCompletedStoreCreditRefunds(refunds);
  const bookingTotalRefunded = parseRefundAmount(
    (booking as { total_refunded?: unknown } | null)?.total_refunded,
  );
  const walletCreditedTotal = Math.max(walletFromRefunds, bookingTotalRefunded);
  const effectiveRefundedTotal = walletCreditedTotal;

  return {
    walletCreditedTotal,
    bookingTotalRefunded,
    effectiveRefundedTotal,
    bookingRefunds: refunds,
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
 * the charge row without issuing a new wallet credit.
 */
export async function backfillPaymentTransactionFromBookingRefunds(
  opts: BackfillPaymentTransactionRefundOptions,
): Promise<boolean> {
  const { supabase, bookingId, transactionId, txnAmount, txnRefundedAmount, coverage } =
    opts;

  if (coverage.walletCreditedTotal <= txnRefundedAmount + 0.001) {
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
    transactionId,
    cumulativeRefundAmount: Math.min(txnAmount, coverage.walletCreditedTotal),
    originalChargeAmount: txnAmount,
    reason,
    actorUserId: null,
  });

  return result.synced;
}
