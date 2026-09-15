import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchOrphanRefundPaymentTxsForTenant } from "@/lib/admin/payment-transactions-tenant-scope";
import { attachBookingRefundsToRows } from "@/lib/admin/refund-list-normalize";
import {
  extractBookingIdsFromRefundRows,
  fetchBookingRefundsForBookingIds,
} from "@/lib/admin/fetch-booking-refunds";
import { fetchBookingTenderSyntheticRows } from "@/lib/admin/fetch-booking-tender-rows";
import { fetchRefundQueueContext } from "@/lib/admin/fetch-refund-queue-context";
import { buildRefundQueueRows, countRefundsNeedingReviewFromQueue } from "@/lib/admin/refund-queue-rows";
import type { RefundListRow } from "@/lib/admin/refund-list-normalize";

const REFUND_ELIGIBLE_OR =
  "transaction_type.eq.refund,refund_amount.not.is.null,status.eq.success";

/**
 * Count bookings that genuinely need admin refund review (matches Needs action tab).
 */
export async function countRefundsNeedingReview(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<number> {
  const bookingIdsFromSignals = await fetchNeedsActionBookingIds(supabase, tenantId);

  let bookingQuery = supabase
    .from("payment_transactions")
    .select(
      `
        id,
        booking_id,
        transaction_type,
        amount,
        refund_amount,
        status,
        created_at,
        provider,
        metadata,
        booking:bookings!inner(
          id,
          booking_number,
          status,
          payment_status,
          total_paid,
          total_refunded,
          tenant_id
        )
      `,
    )
    .or(REFUND_ELIGIBLE_OR)
    .eq("booking.tenant_id", tenantId);

  if (bookingIdsFromSignals.size > 0) {
    bookingQuery = bookingQuery.in("booking_id", [...bookingIdsFromSignals]);
  } else {
    bookingQuery = bookingQuery.in("booking.status", ["cancelled", "no_show"]);
  }

  const { data: bookingLinked } = await bookingQuery.limit(500);

  let rows = (bookingLinked ?? []) as RefundListRow[];
  let bookingIds = extractBookingIdsFromRefundRows(rows);

  const missing = [...bookingIdsFromSignals].filter((id) => !bookingIds.includes(id));
  if (missing.length > 0) {
    const tenderRows = await fetchBookingTenderSyntheticRows(supabase, tenantId, missing);
    rows = [...rows, ...tenderRows];
    bookingIds = extractBookingIdsFromRefundRows(rows);
  }

  const refundsByBookingId = await fetchBookingRefundsForBookingIds(supabase, bookingIds);
  const withRefunds = attachBookingRefundsToRows(rows, refundsByBookingId);

  const ctx = await fetchRefundQueueContext(supabase, tenantId, bookingIds);
  const queueRows = buildRefundQueueRows(withRefunds, ctx);

  return countRefundsNeedingReviewFromQueue(queueRows);
}

async function fetchNeedsActionBookingIds(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<Set<string>> {
  const ids = new Set<string>();

  const [disputes, tickets, problemRefunds] = await Promise.all([
    supabase
      .from("booking_disputes")
      .select("booking_id, bookings!inner(tenant_id)")
      .eq("status", "open")
      .eq("bookings.tenant_id", tenantId),
    supabase
      .from("support_tickets")
      .select("support_context_id")
      .eq("support_context_type", "booking")
      .in("category", ["payment_refund", "booking_reschedule_cancel"])
      .in("status", ["open", "pending", "in_progress"]),
    supabase
      .from("booking_refunds")
      .select("booking_id, bookings!inner(tenant_id)")
      .in("status", ["pending", "failed"])
      .eq("bookings.tenant_id", tenantId),
  ]);

  for (const d of disputes.data ?? []) {
    const bid = (d as { booking_id?: string }).booking_id;
    if (bid) ids.add(String(bid));
  }
  for (const t of tickets.data ?? []) {
    const bid = (t as { support_context_id?: string }).support_context_id;
    if (bid) ids.add(String(bid));
  }
  for (const r of problemRefunds.data ?? []) {
    const bid = (r as { booking_id?: string }).booking_id;
    if (bid) ids.add(String(bid));
  }

  return ids;
}

export async function fetchRefundableActivitySample(
  supabase: SupabaseClient,
  tenantId: string,
  limit: number,
): Promise<Array<{ id: string; amount?: number; created_at?: string }>> {
  const count = await countRefundsNeedingReview(supabase, tenantId);
  if (count <= 0) return [];

  const { data } = await supabase
    .from("payment_transactions")
    .select("id, amount, created_at, booking:bookings!inner(tenant_id, status)")
    .or(REFUND_ELIGIBLE_OR)
    .eq("booking.tenant_id", tenantId)
    .in("booking.status", ["cancelled", "no_show"])
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []) as Array<{ id: string; amount?: number; created_at?: string }>;
}
