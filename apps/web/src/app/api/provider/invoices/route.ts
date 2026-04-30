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
    const dateFrom = searchParams.get("date_from");
    const dateTo = searchParams.get("date_to");

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
      .eq("provider_id", providerId);
    if (status) {
      query = query.eq("status", status);
    }
    if (invoiceType) {
      query = query.eq("invoice_type", invoiceType);
    }
    if (dateFrom) {
      query = query.gte("issue_date", dateFrom);
    }
    if (dateTo) {
      query = query.lte("issue_date", dateTo);
    }
    query = query
      .order("issue_date", { ascending: false })
      .range(offset, offset + limit - 1);

    const { data: invoices, error, count } = await query;

    if (error) {
      throw error;
    }

    let summaryQuery = supabase
      .from("provider_invoices")
      .select("status, total_amount")
      .eq("provider_id", providerId);
    if (status) {
      summaryQuery = summaryQuery.eq("status", status);
    }
    if (invoiceType) {
      summaryQuery = summaryQuery.eq("invoice_type", invoiceType);
    }
    if (dateFrom) {
      summaryQuery = summaryQuery.gte("issue_date", dateFrom);
    }
    if (dateTo) {
      summaryQuery = summaryQuery.lte("issue_date", dateTo);
    }
    const { data: summaryRows } = await summaryQuery;

    const summary = (summaryRows || []).reduce(
      (acc, invoice) => {
        const row = invoice as { status?: string | null; total_amount?: number | null };
        const amount = Number(row.total_amount ?? 0);
        if (row.status === "paid") {
          acc.paid_amount += amount;
        }
        if (row.status === "pending" || row.status === "overdue") {
          acc.outstanding_amount += amount;
        }
        if (row.status === "overdue") {
          acc.overdue_count += 1;
        }
        return acc;
      },
      { paid_amount: 0, outstanding_amount: 0, overdue_count: 0 }
    );

    return successResponse({
      invoices: invoices || [],
      total: count || 0,
      page,
      limit,
      total_pages: Math.ceil((count || 0) / limit),
      summary,
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch invoices");
  }
}
