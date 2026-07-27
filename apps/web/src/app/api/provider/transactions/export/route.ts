import { NextRequest } from "next/server";
import {
  getProviderIdForUser,
  successResponse,
  notFoundResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { requireAnyPermission } from "@/lib/auth/requirePermission";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { formatDateYmd } from "@/lib/dates/provider-tz";
import { filterLedgerRowsForLocation, getProviderReportContext } from "@/lib/reports/provider-report-utils";
import {
  mapFinanceLedgerRowToProviderUi,
  providerTransactionsPeriodStart,
  PROVIDER_LEDGER_VISIBLE_TYPES,
  type ProviderLedgerUiRow,
} from "@/lib/provider/provider-ledger-transaction-view";
import { enrichProviderLedgerRowsForUi } from "@/lib/provider/enrich-provider-ledger-rows";

const VISIBLE_TYPES_LIST = Array.from(PROVIDER_LEDGER_VISIBLE_TYPES);

function csvCell(value: unknown): string {
  if (value == null) return "";
  return `"${String(value).replace(/"/g, '""')}"`;
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
        .select(
          "id, transaction_type, amount, net, created_at, description, booking_id, product_order_id, metadata, refund_component, currency, source_payment_id",
        )
        .eq("provider_id", providerId)
        .gte("created_at", providerTransactionsPeriodStart(period, reportContext.timezone).toISOString())
        .in("transaction_type", VISIBLE_TYPES_LIST)
        .order("created_at", { ascending: false })
        .range(from, from + pageSize - 1);
      if (error) throw error;
      txnsRaw.push(...(data ?? []));
      if (!data || data.length < pageSize) break;
    }

    const txns = await filterLedgerRowsForLocation(supabaseAdmin, providerId, txnsRaw ?? [], locationId, {
      unattributedRows: "include",
    });

    const enrichment = await enrichProviderLedgerRowsForUi(supabaseAdmin, providerId, txns);

    const transactions = txns
      .map((t: any) => mapFinanceLedgerRowToProviderUi(t, enrichment.get(String(t.id))))
      .filter((x): x is ProviderLedgerUiRow => x != null);

    return successResponse({
      filename: `beautonomi_transactions_${period}_${formatDateYmd(new Date(), reportContext.timezone)}.csv`,
      csv: toCsv(transactions),
      row_count: transactions.length,
      truncated: false,
    });
  } catch (error) {
    console.error("Error exporting transactions:", error);
    return handleApiError(error, "Failed to export transactions");
  }
}
