import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRole, unauthorizedResponse } from "@/lib/auth/requireRole";
import { successResponse, handleApiError } from "@/lib/supabase/api-helpers";

/**
 * GET /api/admin/refunds
 * 
 * Fetch all refunds with filtering and pagination
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireRole(["superadmin"]);
    if (!auth) {
      return unauthorizedResponse("Authentication required");
    }

    const supabase = await getSupabaseServer();
    const { searchParams } = new URL(request.url);

    const status = searchParams.get("status"); // all, success, failed, pending, refunded, partially_refunded
    const transactionType = searchParams.get("transaction_type"); // refund
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = (page - 1) * limit;

    let query = supabase
      .from("payment_transactions")
      .select(`
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
        gateway_response,
        created_at,
        updated_at,
        booking:bookings(
          id,
          booking_number,
          status,
          total_amount,
          customer_id,
          provider_id,
          customer:users!bookings_customer_id_fkey(id, full_name, email),
          provider:providers!bookings_provider_id_fkey(id, business_name, owner_name, owner_email)
        ),
        refunded_by_user:users!payment_transactions_refunded_by_fkey(id, full_name, email)
      `)
      .or("transaction_type.eq.refund,refund_amount.not.is.null")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    // Apply filters
    if (status && status !== "all") {
      query = query.eq("status", status);
    }

    if (transactionType) {
      query = query.eq("transaction_type", transactionType);
    }

    const { data: refunds, error } = await query;

    if (error) {
      throw error;
    }

    // Get total count for pagination
    let countQuery = supabase
      .from("payment_transactions")
      .select("*", { count: "exact", head: true })
      .or("transaction_type.eq.refund,refund_amount.not.is.null");

    if (status && status !== "all") {
      countQuery = countQuery.eq("status", status);
    }

    if (transactionType) {
      countQuery = countQuery.eq("transaction_type", transactionType);
    }

    const { count } = await countQuery;

    // Get statistics
    const { data: stats } = await supabase
      .from("payment_transactions")
      .select("status, transaction_type, refund_amount, amount")
      .or("transaction_type.eq.refund,refund_amount.not.is.null");

    const totalRefunded = stats?.reduce((sum, t) => sum + (parseFloat(t.refund_amount || "0") || 0), 0) || 0;
    const totalRefundCount = stats?.length || 0;

    const statistics = {
      total: totalRefundCount,
      total_refunded: totalRefunded,
      by_status: {
        success: stats?.filter((r) => r.status === "success").length || 0,
        failed: stats?.filter((r) => r.status === "failed").length || 0,
        pending: stats?.filter((r) => r.status === "pending").length || 0,
        refunded: stats?.filter((r) => r.status === "refunded").length || 0,
        partially_refunded: stats?.filter((r) => r.status === "partially_refunded").length || 0,
      },
      average_refund: totalRefundCount > 0 ? (totalRefunded / totalRefundCount).toFixed(2) : "0.00",
    };

    return successResponse({
      refunds: refunds || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        total_pages: Math.ceil((count || 0) / limit),
      },
      statistics,
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch refunds");
  }
}
