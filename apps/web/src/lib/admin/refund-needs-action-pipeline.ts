import type { SupabaseClient } from "@supabase/supabase-js";
import { attachBookingRefundsToRows, type RefundListRow } from "@/lib/admin/refund-list-normalize";
import {
  extractBookingIdsFromRefundRows,
  fetchBookingRefundsForBookingIds,
} from "@/lib/admin/fetch-booking-refunds";
import { fetchBookingTenderSyntheticRows } from "@/lib/admin/fetch-booking-tender-rows";
import {
  attachAdditionalChargesToContext,
  collectAdditionalChargeIds,
  fetchRefundQueueContext,
} from "@/lib/admin/fetch-refund-queue-context";
import {
  buildRefundQueueRows,
  countRefundsNeedingReviewFromQueue,
  type RefundQueueRow,
} from "@/lib/admin/refund-queue-rows";

export const REFUND_ELIGIBLE_OR =
  "transaction_type.eq.refund,refund_amount.not.is.null,status.eq.success";

export const NEEDS_ACTION_REFUND_SCAN_MAX = 500;
export const REFUND_BOOKING_ID_CHUNK = 100;

const PAYMENT_TX_SELECT_MINIMAL = `
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
    wallet_amount,
    gift_card_amount,
    tenant_id
  )
`;

const PAYMENT_TX_SELECT_LIST = `
  id,
  booking_id,
  transaction_type,
  amount,
  refund_amount,
  refund_reference,
  refund_reason,
  refunded_at,
  refunded_by,
  status,
  created_at,
  provider,
  metadata,
  booking:bookings!inner(
    id,
    booking_number,
    status,
    payment_status,
    total_amount,
    total_paid,
    total_refunded,
    wallet_amount,
    gift_card_amount,
    customer_id,
    provider_id,
    tenant_id,
    customer:users!bookings_customer_id_fkey(id, full_name, email),
    provider:providers!bookings_provider_id_fkey(id, business_name)
  ),
  refunded_by_user:users!payment_transactions_refunded_by_fkey(id, full_name, email)
`;

export function chunkBookingIds(ids: string[], size = REFUND_BOOKING_ID_CHUNK): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < ids.length; i += size) {
    out.push(ids.slice(i, i + size));
  }
  return out;
}

/**
 * Booking ids that may appear on the Refunds "Needs action" tab (matches admin refunds list).
 */
export async function fetchNeedsActionBookingIds(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<Set<string>> {
  const ids = new Set<string>();

  const [disputes, tickets, problemRefunds, cancelledBookings] = await Promise.all([
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
      .in("status", ["open", "pending", "in_progress", "new"]),
    supabase
      .from("booking_refunds")
      .select("booking_id, bookings!inner(tenant_id)")
      .in("status", ["pending", "failed"])
      .eq("bookings.tenant_id", tenantId),
    supabase
      .from("bookings")
      .select("id")
      .eq("tenant_id", tenantId)
      .in("status", ["cancelled", "no_show"]),
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
  for (const b of cancelledBookings.data ?? []) {
    ids.add(String((b as { id: string }).id));
  }

  return ids;
}

async function fetchPaymentRowsForNeedsAction(
  supabase: SupabaseClient,
  tenantId: string,
  bookingIds: string[],
  select: string,
  maxRows: number,
): Promise<RefundListRow[]> {
  if (bookingIds.length === 0) return [];

  const rows: RefundListRow[] = [];
  for (const chunk of chunkBookingIds(bookingIds)) {
    if (rows.length >= maxRows) break;
    const remaining = maxRows - rows.length;
    const { data, error } = await supabase
      .from("payment_transactions")
      .select(select)
      .or(REFUND_ELIGIBLE_OR)
      .eq("booking.tenant_id", tenantId)
      .in("booking_id", chunk)
      .order("created_at", { ascending: false })
      .limit(remaining);
    if (error) throw error;
    rows.push(...((data ?? []) as unknown as RefundListRow[]));
  }
  return rows;
}

export type BuildNeedsActionQueueOptions = {
  maxRows?: number;
  /** When true, include list-page embeds (customer, provider, refund audit fields). */
  forListPage?: boolean;
};

/**
 * Build refund queue rows for the Needs action definition (shared by nav count, list tab, activity).
 */
export async function buildNeedsActionRefundQueueRows(
  supabase: SupabaseClient,
  tenantId: string,
  options?: BuildNeedsActionQueueOptions,
): Promise<{ queueRows: RefundQueueRow[]; scanTruncated: boolean }> {
  const maxRows = options?.maxRows ?? NEEDS_ACTION_REFUND_SCAN_MAX;
  const select = options?.forListPage ? PAYMENT_TX_SELECT_LIST : PAYMENT_TX_SELECT_MINIMAL;

  const bookingIdsFromSignals = await fetchNeedsActionBookingIds(supabase, tenantId);
  const idList = [...bookingIdsFromSignals];

  let rows = await fetchPaymentRowsForNeedsAction(
    supabase,
    tenantId,
    idList,
    select,
    maxRows,
  );

  let bookingIds = extractBookingIdsFromRefundRows(rows);
  const missing = idList.filter((id) => !bookingIds.includes(id));
  if (missing.length > 0) {
    const tenderRows = await fetchBookingTenderSyntheticRows(supabase, tenantId, missing);
    rows = [...rows, ...tenderRows];
    bookingIds = extractBookingIdsFromRefundRows(rows);
  }

  const refundsByBookingId = await fetchBookingRefundsForBookingIds(supabase, bookingIds);
  const withRefunds = attachBookingRefundsToRows(rows, refundsByBookingId);

  const ctx = await fetchRefundQueueContext(supabase, tenantId, bookingIds);
  await attachAdditionalChargesToContext(
    supabase,
    ctx,
    collectAdditionalChargeIds(withRefunds),
  );

  const queueRows = buildRefundQueueRows(withRefunds, ctx);
  const scanTruncated = idList.length > 0 && rows.length >= maxRows;

  return { queueRows, scanTruncated };
}

export async function countRefundsNeedingReview(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<number> {
  const { queueRows } = await buildNeedsActionRefundQueueRows(supabase, tenantId);
  return countRefundsNeedingReviewFromQueue(queueRows);
}

/** Needs-action rows only, for activity feed samples. */
export async function fetchNeedsActionRefundQueueSample(
  supabase: SupabaseClient,
  tenantId: string,
  limit: number,
): Promise<RefundQueueRow[]> {
  const { queueRows } = await buildNeedsActionRefundQueueRows(supabase, tenantId);
  return queueRows.filter((r) => r.needs_action).slice(0, limit);
}
