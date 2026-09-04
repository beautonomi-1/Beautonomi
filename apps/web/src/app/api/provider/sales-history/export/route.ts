import { NextRequest } from "next/server";

import {
  buildProviderSalesHistoryRows,
  type SalesHistoryRow,
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
import { formatDateYmd } from "@/lib/dates/provider-tz";

export const maxDuration = 60;

function csvCell(value: unknown): string {
  if (value == null) return "";
  return `"${String(value).replace(/"/g, '""')}"`;
}

function rowToCsvLine(r: SalesHistoryRow): string {
  return [
    r.sort_date,
    r.source,
    r.subtype,
    r.ref_number,
    r.customer_name,
    r.gross_total.toFixed(2),
    r.platform_fee.toFixed(2),
    r.commission.toFixed(2),
    r.provider_net.toFixed(2),
    r.tip.toFixed(2),
    r.tax.toFixed(2),
    r.travel_fee.toFixed(2),
    r.cancellation_fee.toFixed(2),
    r.refunds.toFixed(2),
    r.payment_status,
    r.currency,
    r.location_id,
  ]
    .map(csvCell)
    .join(",");
}

export async function POST(request: NextRequest) {
  try {
    const permissionCheck = await requireAnyPermission(
      ["view_sales", "view_reports", "process_payments"],
      request,
    );
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }

    const body = await request.json().catch(() => ({}));
    const dateFrom = typeof body.date_from === "string" ? body.date_from : null;
    const dateTo = typeof body.date_to === "string" ? body.date_to : null;
    const locationId = typeof body.location_id === "string" ? body.location_id : null;
    const search = typeof body.search === "string" ? body.search : null;
    const source =
      body.source === "booking" || body.source === "product_order" || body.source === "pos"
        ? body.source
        : "all";

    const supabaseAdmin = getSupabaseAdmin();
    const providerId = await getProviderIdForUser(permissionCheck.user.id, supabaseAdmin);
    if (!providerId) return notFoundResponse("Provider not found");

    const reportContext = await getProviderReportContext(supabaseAdmin, providerId);

    const { rows, truncated_ledger } = await buildProviderSalesHistoryRows({
      db: supabaseAdmin,
      providerId,
      timezone: reportContext.timezone,
      dateFromYmd: dateFrom,
      dateToYmd: dateTo,
      locationId,
      searchTerm: search || undefined,
      source,
    });

    const headers = [
      "sort_date",
      "source",
      "subtype",
      "ref_number",
      "customer_name",
      "gross_total",
      "platform_fee",
      "commission",
      "provider_net",
      "tip",
      "tax",
      "travel_fee",
      "cancellation_fee",
      "refunds",
      "payment_status",
      "currency",
      "location_id",
    ];
    const csv = [headers.map(csvCell).join(","), ...rows.map(rowToCsvLine)].join("\n");

    return successResponse({
      filename: `beautonomi_sales_history_${formatDateYmd(new Date(), reportContext.timezone)}.csv`,
      csv,
      row_count: rows.length,
      truncated_ledger,
    });
  } catch (error) {
    console.error("sales-history export:", error);
    return handleApiError(error, "Failed to export sales history");
  }
}
