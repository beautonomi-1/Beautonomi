import type { SupabaseClient } from "@supabase/supabase-js";
import { MAX_FINANCE_TRANSACTIONS } from "@/lib/reports/constants";
import { fetchAllLedgerPages } from "@/lib/reports/fetch-all-ledger-pages";
import {
  computeProviderRevenueBreakdown,
  type ProviderRevenueLedgerRow,
} from "@/lib/reports/provider-revenue-semantics";

/** @deprecated Use {@link getProviderGamificationEarnings} — kept for imports. */
export const PROVIDER_GAMIFICATION_LEDGER_TYPES = [
  "provider_earnings",
  "tip",
  "travel_fee",
  "cancellation_fee",
  "walk_in_additional_charge",
  "refund",
] as const;

export type ProviderGamificationEarnings = {
  /** All-time recognized provider revenue (matches finance `recognized_revenue_all_time`). */
  recognized_revenue: number;
  /** Recognized revenue minus provider refund clawbacks. */
  net_earnings_after_refunds: number;
  refund_deduction: number;
};

function toLedgerRow(row: {
  net: unknown;
  amount: unknown;
  transaction_type?: string;
  refund_component?: string | null;
}): ProviderRevenueLedgerRow {
  return {
    transaction_type: String(row.transaction_type ?? ""),
    net: Number(row.net ?? 0),
    amount: Number(row.amount ?? 0),
    refund_component: row.refund_component ?? null,
  };
}

/**
 * All-time provider earnings for gamification Activity stats.
 * Uses the same full-ledger pagination + revenue semantics as GET /api/provider/finance
 * and the provider dashboard (`recognized_earnings_total`).
 */
export async function getProviderGamificationEarnings(
  db: SupabaseClient,
  providerId: string
): Promise<ProviderGamificationEarnings> {
  const query = db
    .from("finance_transactions")
    .select("net, amount, transaction_type, refund_component, created_at")
    .eq("provider_id", providerId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  const pages = await fetchAllLedgerPages<{
    net: unknown;
    amount: unknown;
    transaction_type?: string;
    refund_component?: string | null;
  }>(query as Parameters<typeof fetchAllLedgerPages>[0], MAX_FINANCE_TRANSACTIONS);

  const rows = pages.map(toLedgerRow);
  const breakdown = computeProviderRevenueBreakdown(rows);

  return {
    recognized_revenue: breakdown.recognizedRevenue,
    net_earnings_after_refunds: breakdown.netAfterRefunds,
    refund_deduction: breakdown.refundDeduction,
  };
}

/** @deprecated Prefer {@link getProviderGamificationEarnings}.recognized_revenue */
export async function sumProviderGamificationLedgerNet(
  db: SupabaseClient,
  providerId: string
): Promise<number> {
  const earnings = await getProviderGamificationEarnings(db, providerId);
  return earnings.recognized_revenue;
}
