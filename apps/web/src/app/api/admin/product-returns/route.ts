import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireAdminSection,
  successResponse,
  handleApiError,
 } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_ECOMMERCE } from "@/lib/admin-sections";

/**
 * GET /api/admin/product-returns — superadmin: list all return requests
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_ECOMMERCE, request);
    const supabase = await getSupabaseServer(request);
    const { searchParams } = new URL(request.url);

    const status = searchParams.get("status");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const offset = (page - 1) * limit;

    let query = supabase
      .from("product_return_requests")
      .select(
        `*,
        order:product_orders(order_number, total_amount),
        customer:users!product_return_requests_customer_id_fkey(id, full_name, email),
        provider:providers(id, business_name)`,
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) query = query.eq("status", status);

    const { data, error, count } = await query;
    if (error) throw error;

    const { data: allReturns } = await supabase
      .from("product_return_requests")
      .select("status, refund_amount, refund_processed_amount");

    type ReturnRow = { status?: string; refund_processed_amount?: number };
    const returnsList = (allReturns ?? []) as ReturnRow[];
    const summary = {
      total: returnsList.length,
      pending: returnsList.filter((r) => r.status === "pending").length,
      escalated: returnsList.filter((r) => r.status === "escalated").length,
      total_refunded: returnsList
        .filter((r) => r.status === "refunded")
        .reduce((s, r) => s + Number(r.refund_processed_amount ?? 0), 0),
    };

    return successResponse({
      returns: data ?? [],
      summary,
      pagination: { page, limit, total: count ?? 0, totalPages: Math.ceil((count ?? 0) / limit) },
    });
  } catch (err) {
    return handleApiError(err, "Failed to fetch return requests");
  }
}
