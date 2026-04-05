import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { unauthorizedResponse } from "@/lib/auth/requireRole";
import { requireAdminSection, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PROVIDERS_OPERATIONS } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { fetchOrphanRefundPaymentTxsForTenant } from "@/lib/admin/payment-transactions-tenant-scope";

const REFUND_ELIGIBLE_OR =
  "transaction_type.eq.refund,refund_amount.not.is.null,status.eq.success";

/** Merged refund list row (PostgREST shapes vary for embeds). */
type RefundListRow = {
  id: string;
  booking_id?: string | null;
  transaction_type?: string;
  amount?: number | string | null;
  refund_amount?: string | number | null;
  refund_reference?: string | null;
  refund_reason?: string | null;
  refunded_at?: string | null;
  refunded_by?: string | null;
  status?: string;
  created_at?: string;
  booking?: unknown;
  refunded_by_user?: unknown;
};

/**
 * GET /api/admin/refunds
 *
 * Fetch payment_transactions that are either refund-related (type refund or already have refund_amount)
 * or successful charges (status=success) so admins can process refunds. Merges booking-linked rows
 * for the tenant with non-booking gateway rows attributed via metadata (gift, membership, subscriptions).
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_PROVIDERS_OPERATIONS, request);
    if (!user) {
      return unauthorizedResponse("Authentication required");
    }

    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);
    const { searchParams } = new URL(request.url);

    const status = searchParams.get("status"); // all, success, failed, pending, refunded, partially_refunded
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
        booking:bookings!inner(
          id,
          booking_number,
          status,
          total_amount,
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

    if (status && status !== "all") {
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
        status,
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

    const total = merged.length;
    const refunds = merged.slice(offset, offset + limit);

    const totalRefunded = merged.reduce(
      (sum, t) => sum + (parseFloat(String(t.refund_amount || "0")) || 0),
      0,
    );

    const statistics = {
      total,
      total_refunded: totalRefunded,
      by_status: {
        success: merged.filter((r) => r.status === "success").length,
        failed: merged.filter((r) => r.status === "failed").length,
        pending: merged.filter((r) => r.status === "pending").length,
        refunded: merged.filter((r) => r.status === "refunded").length,
        partially_refunded: merged.filter((r) => r.status === "partially_refunded").length,
      },
      average_refund: total > 0 ? (totalRefunded / total).toFixed(2) : "0.00",
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
