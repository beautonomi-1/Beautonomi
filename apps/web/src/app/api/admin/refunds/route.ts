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
import { fetchAllPages, type PageableQuery } from "@/lib/admin/finance-ledger-tenant";
import { buildNeedsActionRefundQueueRows } from "@/lib/admin/refund-needs-action-pipeline";

const REFUND_ELIGIBLE_OR =
  "transaction_type.eq.refund,refund_amount.not.is.null,status.eq.success";

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

    if (status === "needs_action") {
      const { queueRows: allQueueRows, scanTruncated } = await buildNeedsActionRefundQueueRows(
        supabase,
        tenantId,
        { forListPage: true },
      );
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
          is_estimate: scanTruncated,
        },
        statistics,
      });
    }

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

    if (status && status !== "all" && status !== "needs_action" && status !== "explained") {
      bookingQuery = bookingQuery.eq("status", status);
    }
    if (transactionType) {
      bookingQuery = bookingQuery.eq("transaction_type", transactionType);
    }
    if (startDate) bookingQuery = bookingQuery.gte("created_at", startDate);
    if (endDate) bookingQuery = bookingQuery.lte("created_at", endDate);

    bookingQuery = bookingQuery.order("id", { ascending: false });
    const scanMaxRows = 20_000;

    const [bookingPage, orphanRows] = await Promise.all([
      fetchAllPages(bookingQuery as unknown as PageableQuery<RefundListRow>, {
        maxRows: scanMaxRows,
      }),
      fetchOrphanRefundPaymentTxsForTenant(supabase, tenantId, {
            startDate,
            endDate,
            status: status === "explained" ? null : status,
            transactionType,
          }),
    ]);

    const bookingLinked = bookingPage.rows;
    const scanTruncated = bookingPage.truncated;
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
        is_estimate: scanTruncated,
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
