import type { SupabaseClient } from "@supabase/supabase-js";
import type { RefundQueueRow } from "@/lib/admin/refund-queue-rows";
import { ensureCancellationCashRefundObligation } from "@/lib/bookings/cancellation-cash-refund-obligation";

/**
 * Creates pending cash obligations for cancelled bookings stuck on the wallet queue.
 */
export async function backfillCancelledCashRefundObligations(
  supabase: SupabaseClient,
  tenantId: string,
  queueRows: RefundQueueRow[],
): Promise<number> {
  let created = 0;
  for (const row of queueRows) {
    if (row.queue_reason !== "cancelled_unrefunded") continue;
    if (!row.booking_id) continue;
    const booking = row.booking as {
      provider_id?: string;
      customer_id?: string | null;
      booking_number?: string | null;
      currency?: string | null;
      tenant_id?: string | null;
    } | null;
    if (!booking?.provider_id) continue;

    const result = await ensureCancellationCashRefundObligation(supabase, {
      bookingId: row.booking_id,
      tenantId: booking.tenant_id ?? tenantId,
      providerId: booking.provider_id,
      customerId: booking.customer_id,
      bookingNumber: booking.booking_number,
      currency: booking.currency ?? "ZAR",
      cancelledBy: "backfill",
      insert: true,
      createdBy: null,
    });
    if (result.created) created += 1;
  }
  return created;
}
