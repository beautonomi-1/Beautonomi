import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSectionAny, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_FINANCE, ADMIN_SECTION_PROVIDERS_OPERATIONS } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { fetchOrphanRefundPaymentTxsForTenant } from "@/lib/admin/payment-transactions-tenant-scope";
import {
  enrichRefundListRows,
  countActionableRefundable,
  attachBookingRefundsToRows,
  type RefundListRow,
  type EnrichedRefundListRow,
} from "@/lib/admin/refund-list-normalize";
import {
  extractBookingIdsFromRefundRows,
  fetchBookingRefundsForBookingIds,
} from "@/lib/admin/fetch-booking-refunds";

const REFUND_ELIGIBLE_OR =
  "transaction_type.eq.refund,refund_amount.not.is.null,status.eq.success";

/**
 * GET /api/admin/refunds
 *
 * Fetch payment_transactions that are either refund-related (type refund or already have refund_amount)
 * or successful charges (status=success) so admins can process refunds. Merges booking-linked rows
 * for the tenant with non-booking gateway rows attributed via metadata (gift, membership, subscriptions).
 *
 * **Processing** a refund (POST `/api/admin/refunds/[id]`) credits the customer via
 * `wallet_credit_admin` — cash back to bank is not automatic; wallet is used for future bookings
 * unless support runs a separate payout flow.
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminSectionAny([ADMIN_SECTION_FINANCE, ADMIN_SECTION_PROVIDERS_OPERATIONS], request);

    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);
    const { searchParams } = new URL(request.url);

    const status = searchParams.get("status"); // all, needs_action, success, failed, pending, refunded, partially_refunded
    const transactionType = searchParams.get("transaction_type"); // refund
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const offset = (page - 1) * limit;
    const startDate = searchParams.get("start_date");
    const endDate = searchParams.get("end_date");

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

    if (status && status !== "all" && status !== "needs_action") {
      bookingQuery = bookingQuery.eq("status", status);
    }
    if (transactionType) {
      bookingQuery = bookingQuery.eq("transaction_type", transactionType);
    }
    if (startDate) bookingQuery = bookingQuery.gte("created_at", startDate);
    if (endDate) bookingQuery = bookingQuery.lte("created_at", endDate);

    const [bookingResult, orphanRows] = await Promise.all([
      bookingQuery,
      fetchOrphanRefundPaymentTxsForTenant(supabase, tenantId, {
        startDate,
        endDate,
        status: status === "needs_action" ? null : status,
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

    const merged = Array.from(byId.values()).sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return tb - ta;
    });

    const bookingIds = extractBookingIdsFromRefundRows(merged);
    const refundsByBookingId = await fetchBookingRefundsForBookingIds(supabase, bookingIds);
    const withBookingRefunds = attachBookingRefundsToRows(merged, refundsByBookingId);

    let enriched: EnrichedRefundListRow[] = enrichRefundListRows(withBookingRefunds);

    const allEnriched = enriched;
    if (status === "needs_action") {
      enriched = enriched.filter((r) => r.is_processable);
    }

    const total = enriched.length;
    const refunds = enriched.slice(offset, offset + limit);

    const rowsWithRefundRecorded = allEnriched.filter((r) => {
      const n = parseFloat(String(r.effective_refunded_total ?? r.refund_amount ?? "0"));
      return !Number.isNaN(n) && n > 0;
    });
    const totalRefundedAmount = rowsWithRefundRecorded.reduce(
      (sum, t) => sum + (parseFloat(String(t.effective_refunded_total || t.refund_amount || "0")) || 0),
      0,
    );

    const statistics = {
      total_transactions: allEnriched.length,
      actionable_refundable: countActionableRefundable(allEnriched),
      total_refunded_amount: totalRefundedAmount,
      rows_with_refund_recorded: rowsWithRefundRecorded.length,
      by_status: {
        needs_action: countActionableRefundable(allEnriched),
        success: allEnriched.filter((r) => r.status === "success").length,
        failed: allEnriched.filter((r) => r.status === "failed").length,
        pending: allEnriched.filter((r) => r.status === "pending").length,
        refunded: allEnriched.filter((r) => r.status === "refunded").length,
        partially_refunded: allEnriched.filter((r) => r.status === "partially_refunded").length,
      },
      average_refund_among_recorded:
        rowsWithRefundRecorded.length > 0
          ? (totalRefundedAmount / rowsWithRefundRecorded.length).toFixed(2)
          : "0.00",
    };

    return successResponse({
      refunds,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit) || 0,
      },
      statistics,
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch refunds");
  }
}
