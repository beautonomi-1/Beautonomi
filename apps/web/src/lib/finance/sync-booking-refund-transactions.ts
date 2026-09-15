import type { SupabaseClient } from "@supabase/supabase-js";
import { loadBookingRefundCoverage } from "@/lib/admin/booking-refund-coverage";
import { syncPaymentTransactionRefundState } from "@/lib/finance/sync-payment-transaction-refund";

/**
 * Align all gateway charge rows for a booking after any completed refund.
 */
export async function syncBookingRefundTransactions(
  supabase: SupabaseClient,
  bookingId: string,
  reason: string,
  actorUserId?: string | null,
): Promise<void> {
  const coverage = await loadBookingRefundCoverage(supabase, bookingId);
  await syncPaymentTransactionRefundState({
    supabase,
    bookingId,
    cumulativeRefundAmount: coverage.effectiveRefundedTotal,
    reason,
    actorUserId: actorUserId ?? null,
  });
}
