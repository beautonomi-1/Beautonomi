/**
 * Provider ledger feed for GET /api/provider/transactions.
 * Maps and summarizes the full period scan without row enrichment; enriches only the list page.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { filterLedgerRowsForLocation } from "@/lib/reports/provider-report-utils";
import { enrichProviderLedgerRowsForUi } from "@/lib/provider/enrich-provider-ledger-rows";
import {
  mapFinanceLedgerRowToProviderUi,
  providerTransactionsPeriodStart,
  PROVIDER_LEDGER_VISIBLE_TYPES,
  type ProviderLedgerUiRow,
  type ProviderTxnUiType,
} from "@/lib/provider/provider-ledger-transaction-view";

const LEDGER_PAGE_SIZE = 1000;
export const PROVIDER_TRANSACTIONS_MAX_LEDGER_SCAN = 50_000;
export const PROVIDER_TRANSACTIONS_MAX_LIST_LIMIT = 500;

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

export type ProviderTransactionsFeedParams = {
  db: SupabaseClient;
  providerId: string;
  timezone: string;
  period: string;
  limit: number;
  listOffset: number;
  locationId?: string | null;
  typeFilter?: ProviderTxnUiType | "all";
};

function signedContributionForSummary(row: ProviderLedgerUiRow): number {
  if (row.type === "earning" || row.type === "tip") return row.amount;
  if (row.type === "payout" || row.type === "refund" || row.type === "fee") return -row.amount;
  if (row.type === "adjustment") return (row.sign ?? 1) * row.amount;
  return 0;
}

export function summarizeProviderLedgerUiRows(
  rows: ProviderLedgerUiRow[],
  locationScoped = false,
) {
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

function matchesTypeFilter(row: ProviderLedgerUiRow, typeFilter: ProviderTxnUiType | "all"): boolean {
  if (typeFilter === "all") return true;
  return row.type === typeFilter;
}

async function scanVisibleLedgerRows(
  db: SupabaseClient,
  providerId: string,
  fromDate: Date,
): Promise<{ rows: LedgerScanRow[]; truncatedLedger: boolean }> {
  const pageRaw: LedgerScanRow[] = [];
  let offset = 0;
  let truncatedLedger = false;

  while (offset < PROVIDER_TRANSACTIONS_MAX_LEDGER_SCAN) {
    const { data: chunk, error: pageError } = await db
      .from("finance_transactions")
      .select(
        "id, transaction_type, amount, net, created_at, description, booking_id, product_order_id, metadata, refund_component, currency, source_payment_id",
      )
      .eq("provider_id", providerId)
      .gte("created_at", fromDate.toISOString())
      .in("transaction_type", VISIBLE_TYPES_LIST)
      .order("created_at", { ascending: false })
      .range(offset, offset + LEDGER_PAGE_SIZE - 1);

    if (pageError) throw pageError;

    const page = (chunk ?? []) as LedgerScanRow[];
    if (page.length === 0) break;
    pageRaw.push(...page);

    if (page.length < LEDGER_PAGE_SIZE) break;
    offset += LEDGER_PAGE_SIZE;
    if (offset >= PROVIDER_TRANSACTIONS_MAX_LEDGER_SCAN) {
      truncatedLedger = true;
    }
  }

  return { rows: pageRaw, truncatedLedger };
}

export async function buildProviderTransactionsFeed(params: ProviderTransactionsFeedParams) {
  const {
    db,
    providerId,
    timezone,
    period,
    limit,
    listOffset,
    locationId = null,
    typeFilter = "all",
  } = params;

  const fromDate = providerTransactionsPeriodStart(period, timezone);
  const { rows: pageRaw, truncatedLedger } = await scanVisibleLedgerRows(db, providerId, fromDate);

  const scopedRaw = await filterLedgerRowsForLocation(db, providerId, pageRaw, locationId, {
    unattributedRows: "include",
  });

  const mappedWithRaw: Array<{ raw: LedgerScanRow; ui: ProviderLedgerUiRow }> = [];
  for (const t of scopedRaw) {
    const ui = mapFinanceLedgerRowToProviderUi(t, null);
    if (ui) mappedWithRaw.push({ raw: t, ui });
  }

  const typeFiltered = mappedWithRaw.filter((entry) => matchesTypeFilter(entry.ui, typeFilter));

  // Summary matches the active type filter (full period), not only the returned page.
  const summary = summarizeProviderLedgerUiRows(
    typeFiltered.map((entry) => entry.ui),
    Boolean(locationId),
  );

  const pageSlice = typeFiltered.slice(listOffset, listOffset + limit);
  const enrichment = await enrichProviderLedgerRowsForUi(
    db,
    providerId,
    pageSlice.map((entry) => entry.raw),
  );

  const transactions: ProviderLedgerUiRow[] = [];
  for (const { raw } of pageSlice) {
    const enriched = mapFinanceLedgerRowToProviderUi(raw, enrichment.get(String(raw.id)));
    if (enriched) transactions.push(enriched);
  }

  return {
    transactions,
    summary,
    truncated_list: typeFiltered.length > listOffset + limit,
    truncated_ledger: truncatedLedger,
    list_offset: listOffset,
    list_total: typeFiltered.length,
    location_scope: {
      scoped_by_location: Boolean(locationId),
      unattributed_included: Boolean(locationId),
    },
  };
}
