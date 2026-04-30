import { NextRequest } from "next/server";
import {
  getProviderIdForUser,
  successResponse,
  notFoundResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { requireAnyPermission } from "@/lib/auth/requirePermission";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { subDays, subMonths, startOfDay, startOfWeek, startOfMonth } from "date-fns";
import { fromBusinessTime, nowInTz } from "@/lib/dates/provider-tz";
import { filterLedgerRowsForLocation, getProviderReportContext } from "@/lib/reports/provider-report-utils";
import {
  mapFinanceLedgerRowToProviderUi,
  type ProviderLedgerUiRow,
} from "@/lib/provider/provider-ledger-transaction-view";

function csvCell(value: unknown): string {
  if (value == null) return "";
  return `"${String(value).replace(/"/g, '""')}"`;
}

function periodStart(period: string, timezone: string): Date {
  const businessNow = nowInTz(timezone);
  switch (period) {
    case "today":
      return fromBusinessTime(startOfDay(businessNow), timezone);
    case "week":
      return fromBusinessTime(startOfWeek(businessNow, { weekStartsOn: 1 }), timezone);
    case "month":
      return fromBusinessTime(startOfMonth(businessNow), timezone);
    case "3months":
      return fromBusinessTime(subMonths(businessNow, 3), timezone);
    case "year":
      return fromBusinessTime(subMonths(businessNow, 12), timezone);
    case "all":
      return new Date(2000, 0, 1);
    default:
      return fromBusinessTime(subDays(businessNow, 30), timezone);
  }
}

function toCsv(rows: ProviderLedgerUiRow[]): string {
  const headers = [
    "date",
    "type",
    "ledger_type",
    "direction",
    "amount",
    "description",
    "status",
    "booking_id",
    "payment_method",
    "reference",
  ];
  const body = rows.map((row) =>
    [
      row.created_at,
      row.type,
      row.transaction_type,
      row.sign === -1 ? "debit" : "credit",
      row.amount.toFixed(2),
      row.description,
      row.status,
      row.booking_id,
      row.payment_method,
      row.reference,
    ].map(csvCell).join(","),
  );
  return [headers.map(csvCell).join(","), ...body].join("\n");
}

export async function POST(request: NextRequest) {
  try {
    const permissionCheck = await requireAnyPermission(["view_sales", "view_reports", "process_payments"], request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }

    const body = await request.json().catch(() => ({}));
    const period = typeof body.period === "string" ? body.period : "month";
    const locationId = typeof body.location_id === "string" ? body.location_id : null;
    const supabaseAdmin = getSupabaseAdmin();
    const providerId = await getProviderIdForUser(permissionCheck.user.id, supabaseAdmin);
    if (!providerId) return notFoundResponse("Provider not found");
    const reportContext = await getProviderReportContext(supabaseAdmin, providerId);

    const txnsRaw: any[] = [];
    const pageSize = 1000;
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabaseAdmin
        .from("finance_transactions")
        .select("id, transaction_type, amount, net, created_at, description, booking_id, product_order_id, metadata")
        .eq("provider_id", providerId)
        .gte("created_at", periodStart(period, reportContext.timezone).toISOString())
        .order("created_at", { ascending: false })
        .range(from, from + pageSize - 1);
      if (error) throw error;
      txnsRaw.push(...(data ?? []));
      if (!data || data.length < pageSize) break;
    }

    const txns = await filterLedgerRowsForLocation(supabaseAdmin, providerId, txnsRaw ?? [], locationId);

    const transactions = txns
      .map((t: any) => mapFinanceLedgerRowToProviderUi(t))
      .filter((x): x is ProviderLedgerUiRow => x != null);

    return successResponse({
      filename: `beautonomi_transactions_${period}_${new Date().toISOString().slice(0, 10)}.csv`,
      csv: toCsv(transactions),
      row_count: transactions.length,
      truncated: false,
    });
  } catch (error) {
    console.error("Error exporting transactions:", error);
    return handleApiError(error, "Failed to export transactions");
  }
}
