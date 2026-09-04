import { NextRequest } from "next/server";

import {
  queryProviderSalesHistory,
  type SalesHistorySource,
} from "@/lib/reports/provider-sales-history";
import {
  getProviderIdForUser,
  successResponse,
  notFoundResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { requireAnyPermission } from "@/lib/auth/requirePermission";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getProviderReportContext } from "@/lib/reports/provider-report-utils";

export const maxDuration = 60;

function parseSource(raw: string | null): SalesHistorySource | "all" {
  if (raw === "booking" || raw === "product_order" || raw === "pos") return raw;
  return "all";
}

export async function GET(request: NextRequest) {
  try {
    const permissionCheck = await requireAnyPermission(
      ["view_sales", "view_reports", "process_payments"],
      request,
    );
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }

    const supabaseAdmin = getSupabaseAdmin();
    const providerId = await getProviderIdForUser(permissionCheck.user.id, supabaseAdmin);
    if (!providerId) return notFoundResponse("Provider not found");

    const reportContext = await getProviderReportContext(supabaseAdmin, providerId);
    const sp = request.nextUrl.searchParams;

    const page = Math.max(1, parseInt(sp.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(sp.get("limit") || "25", 10)));

    const dateFrom = sp.get("date_from");
    const dateTo = sp.get("date_to");
    const locationId = sp.get("location_id");
    const search = sp.get("search");
    const source = parseSource(sp.get("source"));

    const result = await queryProviderSalesHistory({
      db: supabaseAdmin,
      providerId,
      timezone: reportContext.timezone,
      dateFromYmd: dateFrom,
      dateToYmd: dateTo,
      locationId: locationId || null,
      searchTerm: search || undefined,
      source,
      page,
      limit,
    });

    const totalPages = Math.max(1, Math.ceil(result.total / limit));

    return successResponse({
      data: result.data,
      total: result.total,
      page,
      limit,
      total_pages: totalPages,
      totals: result.totals,
      truncated_ledger: result.truncated_ledger,
      default_range_months: result.usesDefaultRange ? 24 : null,
      basis:
        "Rows keyed by finance_transactions.created_at in range. gross_total = bookings.total_amount. " +
        "provider_net = earnings + tips + travel + cancellation + walk-in add-ons − provider refunds. " +
        "discount_contra = promotion/membership/loyalty contra rows (absolute); reconciles gross when total_amount is pre-discount.",
    });
  } catch (error) {
    console.error("sales-history GET:", error);
    return handleApiError(error, "Failed to load sales history");
  }
}
