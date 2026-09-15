import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSectionAny, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_FINANCE, ADMIN_SECTION_PROVIDERS_OPERATIONS } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { fetchOrphanRefundPaymentTxsForTenant } from "@/lib/admin/payment-transactions-tenant-scope";
import {
  attachBookingRefundsToRows,
  type RefundListRow,
} from "@/lib/admin/refund-list-normalize";
import {
  extractBookingIdsFromRefundRows,
  fetchBookingRefundsForBookingIds,
} from "@/lib/admin/fetch-booking-refunds";
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
import { parseRefundAmount } from "@/lib/admin/booking-refund-context";
import { fetchBookingTenderSyntheticRows } from "@/lib/admin/fetch-booking-tender-rows";

const REFUND_ELIGIBLE_OR =
  "transaction_type.eq.refund,refund_amount.not.is.null,status.eq.success";

async function fetchNeedsActionBookingIds(
  supabase: ReturnType<typeof getSupabaseAdmin>,
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

function filterQueueByTab(rows: RefundQueueRow[], status: string | null): RefundQueueRow[] {
  if (!status || status === "all") return rows;
  if (status === "needs_action") {
    return rows.filter((r) => r.needs_action);
  }
  if (status === "explained") {
    return rows.filter(
      (r) =>
        !r.needs_action &&
        r.queue_reason !== "not_applicable" &&
        r.remaining_refundable <= 0,
    );
  }
  if (status === "success" || status === "failed" || status === "pending") {
    return rows.filter((r) =>
      r.captures.some((c) => String(c.status ?? "") === status),
    );
  }
  if (status === "refunded" || status === "partially_refunded") {
    return rows.filter((r) =>
      r.captures.some((c) => String(c.status ?? "") === status),
    );
  }
  return rows;
}

/**
 * GET /api/admin/refunds
 *
 * Booking-centric refund review queue. Cancellation auto-credits the wallet;
 * this list surfaces exceptions and manual support credits.
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminSectionAny([ADMIN_SECTION_FINANCE, ADMIN_SECTION_PROVIDERS_OPERATIONS], request);

    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);
    const { searchParams } = new URL(request.url);

    const status = searchParams.get("status");
    const transactionType = searchParams.get("transaction_type");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "25", 10);
    const offset = (page - 1) * limit;
    const startDate = searchParams.get("start_date");
    const endDate = searchParams.get("end_date");

    const needsActionIds =
      status === "needs_action" ? await fetchNeedsActionBookingIds(supabase, tenantId) : null;

    let bookingQuery = supabase
      .from("payment_transactions")
      .select(
        `
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
      `,
      )
      .or(REFUND_ELIGIBLE_OR)
      .eq("booking.tenant_id", tenantId)
      .order("created_at", { ascending: false });

    if (needsActionIds && needsActionIds.size > 0) {
      bookingQuery = bookingQuery.in("booking_id", [...needsActionIds]);
    } else if (status === "needs_action") {
      bookingQuery = bookingQuery.in("booking.status", ["cancelled", "no_show"]);
    }

    if (status && status !== "all" && status !== "needs_action" && status !== "explained") {
      bookingQuery = bookingQuery.eq("status", status);
    }
    if (transactionType) {
      bookingQuery = bookingQuery.eq("transaction_type", transactionType);
    }
    if (startDate) bookingQuery = bookingQuery.gte("created_at", startDate);
    if (endDate) bookingQuery = bookingQuery.lte("created_at", endDate);

    const scanLimit = status === "needs_action" ? 500 : 1000;
    bookingQuery = bookingQuery.limit(scanLimit);

    const [bookingResult, orphanRows] = await Promise.all([
      bookingQuery,
      status === "needs_action"
        ? Promise.resolve([])
        : fetchOrphanRefundPaymentTxsForTenant(supabase, tenantId, {
            startDate,
            endDate,
            status: status === "explained" ? null : status,
            transactionType,
          }),
    ]);

    if (bookingResult.error) {
      throw bookingResult.error;
    }

    const bookingLinked = (bookingResult.data || []) as RefundListRow[];
    const orphansWithBookingNull: RefundListRow[] = orphanRows.map((row) => ({
      ...row,
      booking: null,
    }));

    const byId = new Map<string, RefundListRow>();
    for (const r of bookingLinked) {
      byId.set(r.id, r);
    }
    for (const r of orphansWithBookingNull) {
      if (!byId.has(r.id)) byId.set(r.id, r);
    }

    let merged = Array.from(byId.values());
    let bookingIds = extractBookingIdsFromRefundRows(merged);

    if (needsActionIds && needsActionIds.size > 0) {
      const missing = [...needsActionIds].filter((id) => !bookingIds.includes(id));
      if (missing.length > 0) {
        const tenderRows = await fetchBookingTenderSyntheticRows(supabase, tenantId, missing);
        for (const row of tenderRows) {
          if (!byId.has(row.id)) {
            byId.set(row.id, row);
          }
        }
        merged = Array.from(byId.values());
        bookingIds = extractBookingIdsFromRefundRows(merged);
      }
    }
    const refundsByBookingId = await fetchBookingRefundsForBookingIds(supabase, bookingIds);
    const withBookingRefunds = attachBookingRefundsToRows(merged, refundsByBookingId);

    const ctx = await fetchRefundQueueContext(supabase, tenantId, bookingIds);
    await attachAdditionalChargesToContext(
      supabase,
      ctx,
      collectAdditionalChargeIds(withBookingRefunds),
    );

    const allQueueRows = buildRefundQueueRows(withBookingRefunds, ctx);
    const filtered = filterQueueByTab(allQueueRows, status);
    const total = filtered.length;
    const pageRows = filtered.slice(offset, offset + limit);

    const rowsWithRefund = allQueueRows.filter((r) => r.refunded > 0);
    const totalRefundedAmount = rowsWithRefund.reduce((sum, r) => sum + r.refunded, 0);

    const statistics = {
      total_transactions: allQueueRows.length,
      actionable_refundable: countRefundsNeedingReviewFromQueue(allQueueRows),
      needs_review: countRefundsNeedingReviewFromQueue(allQueueRows),
      total_refunded_amount: totalRefundedAmount,
      rows_with_refund_recorded: rowsWithRefund.length,
      by_status: {
        needs_action: countRefundsNeedingReviewFromQueue(allQueueRows),
        explained: allQueueRows.filter(
          (r) =>
            !r.needs_action &&
            r.queue_reason !== "not_applicable" &&
            r.remaining_refundable <= 0,
        ).length,
        success: allQueueRows.filter((r) => r.captures.some((c) => c.status === "success")).length,
        failed: allQueueRows.filter((r) => r.captures.some((c) => c.status === "failed")).length,
        pending: allQueueRows.filter((r) => r.captures.some((c) => c.status === "pending")).length,
        refunded: allQueueRows.filter((r) => r.captures.some((c) => c.status === "refunded")).length,
        partially_refunded: allQueueRows.filter((r) =>
          r.captures.some((c) => c.status === "partially_refunded"),
        ).length,
      },
      average_refund_among_recorded:
        rowsWithRefund.length > 0
          ? (totalRefundedAmount / rowsWithRefund.length).toFixed(2)
          : "0.00",
    };

    const refunds = pageRows.map((row) => ({
      ...serializeQueueRow(row),
      booking_refunds: (row.enriched?.booking_refunds ?? []) as unknown[],
    }));

    return successResponse({
      refunds,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit) || 0,
        is_estimate: merged.length >= scanLimit,
      },
      statistics,
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch refunds");
  }
}

function serializeQueueRow(row: RefundQueueRow) {
  const booking = row.booking as Record<string, unknown> | null;
  const enriched = row.enriched;
  return {
    id: row.primary_transaction_id ?? row.key,
    key: row.key,
    source: row.source,
    booking_id: row.booking_id,
    transaction_type: enriched?.transaction_type ?? null,
    amount: row.collected,
    refund_amount: row.refunded,
    effective_refunded_total: row.refunded,
    remaining_refundable: row.remaining_refundable,
    reserved: row.reserved,
    status: enriched?.status ?? "success",
    created_at: enriched?.created_at ?? null,
    provider: enriched?.provider ?? null,
    metadata: enriched?.metadata ?? null,
    booking,
    queue_reason: row.queue_reason,
    queue_reason_detail: row.queue_reason_detail,
    queue_reason_label: row.queue_reason_label,
    tender_label: row.tender_label,
    charge_label: row.captures[0]?.charge_label ?? null,
    additional_charge_description: row.additional_charge_description,
    booking_status: booking?.status ?? null,
    payment_status: booking?.payment_status ?? null,
    is_processable: row.is_processable,
    needs_action: row.needs_action,
    captures: row.captures,
    primary_transaction_id: row.primary_transaction_id,
    refund_state: enriched?.refund_state ?? "not_refunded",
    credited_via: enriched?.credited_via ?? null,
    effective_reason: enriched?.effective_reason ?? null,
    wallet_credited_at: enriched?.wallet_credited_at ?? null,
    refunded_at: enriched?.refunded_at ?? null,
    refunded_by_user: enriched?.refunded_by_user ?? null,
    payout_method: row.refunded > 0 ? "wallet" : null,
    txn_refunded_total: parseRefundAmount(enriched?.refund_amount),
    wallet_credited_total: enriched?.wallet_credited_total ?? row.refunded,
  };
}
