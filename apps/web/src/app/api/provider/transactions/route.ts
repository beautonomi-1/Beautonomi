import { NextRequest } from "next/server";
import {
  getProviderIdForUser,
  successResponse,
  notFoundResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { requireAnyPermission } from "@/lib/auth/requirePermission";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { filterLedgerRowsForLocation, getProviderReportContext } from "@/lib/reports/provider-report-utils";
import {
  mapFinanceLedgerRowToProviderUi,
  providerTransactionsPeriodStart,
  PROVIDER_LEDGER_VISIBLE_TYPES,
  type ProviderLedgerUiRow,
} from "@/lib/provider/provider-ledger-transaction-view";
import { enrichProviderLedgerRowsForUi } from "@/lib/provider/enrich-provider-ledger-rows";

const LEDGER_PAGE_SIZE = 1000;
const MAX_LEDGER_SCAN = 50_000;
const MAX_LIST_LIMIT = 500;

const VISIBLE_TYPES_LIST = Array.from(PROVIDER_LEDGER_VISIBLE_TYPES);

type LedgerScanRow = {
  id: string;
  transaction_type: string;
  amount?: number | null;
  net?: number | null;
  created_at: string;
  description?: string | null;
  booking_id?: string | null;
  product_order_id?: string | null;
  metadata?: unknown;
  refund_component?: string | null;
  currency?: string | null;
  source_payment_id?: string | null;
};

function signedContributionForSummary(row: ProviderLedgerUiRow): number {
  if (row.type === "earning" || row.type === "tip") return row.amount;
  if (row.type === "payout" || row.type === "refund" || row.type === "fee") return -row.amount;
  if (row.type === "adjustment") return (row.sign ?? 1) * row.amount;
  return 0;
}

function summarizeTransactions(rows: ProviderLedgerUiRow[], locationScoped = false) {
  let totalIn = 0;
  let totalOut = 0;
  for (const row of rows) {
    if (row.type === "earning" || row.type === "tip") totalIn += row.amount;
    if (row.type === "payout" || row.type === "refund") totalOut += row.amount;
  }
  const net = rows.reduce((s, r) => s + signedContributionForSummary(r), 0);
  return {
    total_in: totalIn,
    total_out: totalOut,
    net,
    row_count: rows.length,
    basis_note: locationScoped
      ? "Server totals for the full selected period (selected branch). At-home and walk-in bookings with no branch are included. Payouts and provider-level charges are org-wide. List below may show fewer rows due to the limit parameter."
      : "Server totals for the full selected period (all branches). List below may show fewer rows due to the limit parameter.",
  };
}

export async function GET(request: NextRequest) {
  try {
    const permissionCheck = await requireAnyPermission(["view_sales", "view_reports", "process_payments"], request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;

    const supabaseAdmin = getSupabaseAdmin();

    const providerId = await getProviderIdForUser(user.id, supabaseAdmin);
    if (!providerId) return notFoundResponse("Provider not found");
    const reportContext = await getProviderReportContext(supabaseAdmin, providerId);
    const sp = request.nextUrl.searchParams;
    const period = sp.get("period") || "month";
    const limit = Math.min(parseInt(sp.get("limit") || "50", 10), MAX_LIST_LIMIT);
    const listOffset = Math.max(parseInt(sp.get("offset") || "0", 10) || 0, 0);

    const locationId = sp.get("location_id") || null;
    const fromDate = providerTransactionsPeriodStart(period, reportContext.timezone);

    const pageRaw: LedgerScanRow[] = [];
    let offset = 0;
    let truncatedLedger = false;

    while (offset < MAX_LEDGER_SCAN) {
      const { data: chunk, error: pageError } = await supabaseAdmin
        .from("finance_transactions")
        .select(
          "id, transaction_type, amount, net, created_at, description, booking_id, product_order_id, metadata, refund_component, currency, source_payment_id",
        )
        .eq("provider_id", providerId)
        .gte("created_at", fromDate.toISOString())
        .in("transaction_type", VISIBLE_TYPES_LIST)
        .order("created_at", { ascending: false })
        .range(offset, offset + LEDGER_PAGE_SIZE - 1);

      if (pageError) {
        console.error("Error fetching transactions page:", pageError);
        return handleApiError(pageError, "Failed to load transactions");
      }

      const page = (chunk ?? []) as LedgerScanRow[];
      if (page.length === 0) break;
      pageRaw.push(...page);

      if (page.length < LEDGER_PAGE_SIZE) break;
      offset += LEDGER_PAGE_SIZE;
      if (offset >= MAX_LEDGER_SCAN) {
        truncatedLedger = true;
      }
    }

    const scopedRaw = await filterLedgerRowsForLocation(
      supabaseAdmin,
      providerId,
      pageRaw,
      locationId,
      { unattributedRows: "include" },
    );

    const enrichment = await enrichProviderLedgerRowsForUi(supabaseAdmin, providerId, scopedRaw);

    const allMapped: ProviderLedgerUiRow[] = [];
    for (const t of scopedRaw) {
      const ui = mapFinanceLedgerRowToProviderUi(t, enrichment.get(String(t.id)));
      if (ui) allMapped.push(ui);
    }

    const summary = summarizeTransactions(allMapped, Boolean(locationId));
    const transactions = allMapped.slice(listOffset, listOffset + limit);

    return successResponse({
      transactions,
      summary,
      truncated_list: allMapped.length > listOffset + limit,
      truncated_ledger: truncatedLedger,
      list_offset: listOffset,
      list_total: allMapped.length,
      location_scope: {
        scoped_by_location: Boolean(locationId),
        unattributed_included: Boolean(locationId),
      },
    });
  } catch (error) {
    console.error("Error fetching transactions:", error);
    return handleApiError(error, "Failed to load transactions");
  }
}
