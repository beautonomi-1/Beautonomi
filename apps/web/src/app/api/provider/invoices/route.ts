import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  getProviderIdForUser,
  getPaginationParams,
} from "@/lib/supabase/api-helpers";
/**
 * GET /api/provider/invoices
 * Get list of invoices for the provider
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);

    if (!providerId) {
      return handleApiError(
        new Error("Provider not found"),
        "Provider not found",
        "NOT_FOUND",
        404
      );
    }

    const { page, limit, offset } = getPaginationParams(request);
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get("status");
    const invoiceType = searchParams.get("type");

    let query = supabase
      .from("provider_invoices")
      .select(
        `
        *,
        payment_methods:provider_payment_methods(id, name, type, last4),
        line_items:provider_invoice_line_items(*),
        payments:provider_invoice_payments(*)
      `,
        { count: "exact" }
      )
      .eq("provider_id", providerId)
      .order("issue_date", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq("status", status);
    }

    if (invoiceType) {
      query = query.eq("invoice_type", invoiceType);
    }

    const { data: invoices, error, count } = await query;

    if (error) {
      throw error;
    }

    return successResponse({
      invoices: invoices || [],
      total: count || 0,
      page,
      limit,
      total_pages: Math.ceil((count || 0) / limit),
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch invoices");
  }
}
