import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * GET /api/admin/export/finance
 * 
 * Export financial data to CSV (rate limited)
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireRoleInApi(['superadmin']);
    const { allowed, retryAfter } = checkRateLimit(auth.user.id, "export:finance");
    if (!allowed) {
      return errorResponse(
        `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
        "RATE_LIMIT_EXCEEDED",
        429
      );
    }

    const supabase = await getSupabaseServer();

    const { searchParams } = new URL(request.url);
    const transactionType = searchParams.get("transaction_type");
    const startDate = searchParams.get("start_date");
    const endDate = searchParams.get("end_date");

    let query = supabase
      .from("finance_transactions")
      .select(`
        *,
        booking:bookings(id, booking_number, customer_id, provider_id)
      `)
      .order("created_at", { ascending: false });

    if (transactionType && transactionType !== "all") {
      query = query.eq("transaction_type", transactionType);
    }

    if (startDate) {
      query = query.gte("created_at", startDate);
    }

    if (endDate) {
      query = query.lte("created_at", endDate);
    }

    const { data: transactions, error } = await query;

    if (error) {
      return handleApiError(error, "Failed to fetch financial data");
    }

    // Convert to CSV
    const headers = [
      "ID",
      "Transaction Type",
      "Amount",
      "Net",
      "Fees",
      "Currency",
      "Status",
      "Booking ID",
      "Booking Number",
      "Provider ID",
      "Customer ID",
      "Created At",
      "Metadata",
    ];

    const rows = (transactions || []).map((transaction: any) => [
      transaction.id,
      transaction.transaction_type,
      transaction.amount,
      transaction.net,
      transaction.fees || 0,
      transaction.currency,
      transaction.status,
      transaction.booking_id || "",
      transaction.booking?.booking_number || "",
      transaction.booking?.provider_id || "",
      transaction.booking?.customer_id || "",
      transaction.created_at,
      JSON.stringify(transaction.metadata || {}),
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")),
    ].join("\n");

    return new Response(csvContent, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="finance-export-${new Date().toISOString().split("T")[0]}.csv"`,
      },
    });
  } catch (error) {
    return handleApiError(error, "Failed to export financial data");
  }
}
