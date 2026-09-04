import type { SupabaseClient } from "@supabase/supabase-js";
import { isProviderEarningsRefundComponent } from "@/lib/ledger/refund-components";
import { fetchAllPaged } from "@/lib/provider-ops/postgrest-unbounded";
import { MAX_FINANCE_TRANSACTIONS } from "@/lib/reports/constants";

const EXPENSE_TYPES = ["provider_subscription_payment", "provider_ads_payment", "provider_expense"] as const;

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Ledger aggregates for provider analytics, aligned with
 * `GET /api/provider/finance` semantics (platform retained fees, refund shape, tips as net).
 */
export type LedgerRange = { from: Date; to: Date };

async function fetchAllNetRows(
  db: SupabaseClient,
  providerId: string,
  types: string[],
  range?: LedgerRange
): Promise<{ net: number | null; amount: number | null }[]> {
  return fetchAllPaged(async (from, to) => {
    let q = db
      .from("finance_transactions")
      .select("id, net, amount")
      .eq("provider_id", providerId)
      .in("transaction_type", types)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });
    if (range) {
      q = q.gte("created_at", range.from.toISOString()).lte("created_at", range.to.toISOString());
    }
    const { data, error } = await q.range(from, to);
    return { data, error };
  }, MAX_FINANCE_TRANSACTIONS);
}

/** Sum of `net` (fallback `amount`) for given types — use for tips, expenses, cancellation_fee. */
export async function sumNetByTypes(
  db: SupabaseClient,
  providerId: string,
  types: string[],
  range?: LedgerRange
): Promise<number> {
  const rows = await fetchAllNetRows(db, providerId, types, range);
  return rows.reduce((s, r) => s + num(r.net ?? r.amount), 0);
}

/**
 * Customer/platform fees retained (booking `service_fee`, ecommerce `platform_fee`).
 * Uses absolute value to match finance “platform fees deducted” presentation.
 */
export async function sumPlatformRetainedFees(
  db: SupabaseClient,
  providerId: string,
  range?: LedgerRange
): Promise<number> {
  const rows = await fetchAllNetRows(db, providerId, ["platform_fee", "service_fee"], range);
  return rows.reduce((s, r) => s + Math.abs(num(r.net ?? r.amount)), 0);
}

/**
 * Refunds: explicit `refund` rows plus negative `provider_earnings` (same as finance route).
 */
export async function sumRefundsLikeFinance(
  db: SupabaseClient,
  providerId: string,
  range?: LedgerRange
): Promise<number> {
  const [refundRows, negEarnings] = await Promise.all([
    fetchAllPaged<{ net: number | null; amount: number | null; refund_component: string | null }>(async (from, to) => {
      let q = db
        .from("finance_transactions")
        .select("id, net, amount, refund_component")
        .eq("provider_id", providerId)
        .eq("transaction_type", "refund")
        .order("created_at", { ascending: true })
        .order("id", { ascending: true });
      if (range) {
        q = q.gte("created_at", range.from.toISOString()).lte("created_at", range.to.toISOString());
      }
      const { data, error } = await q.range(from, to);
      return { data, error };
    }, MAX_FINANCE_TRANSACTIONS),
    fetchAllPaged<{ net: number | null }>(async (from, to) => {
      let q = db
        .from("finance_transactions")
        .select("id, net")
        .eq("provider_id", providerId)
        .eq("transaction_type", "provider_earnings")
        .lt("net", 0)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true });
      if (range) {
        q = q.gte("created_at", range.from.toISOString()).lte("created_at", range.to.toISOString());
      }
      const { data, error } = await q.range(from, to);
      return { data, error };
    }, MAX_FINANCE_TRANSACTIONS),
  ]);
  // Only provider-affecting refund components reduce provider earnings; platform
  // fee/commission, tax, discount contras and wallet/gift tender legs are excluded.
  const fromRefunds = refundRows.reduce(
    (s, r) => (isProviderEarningsRefundComponent(r.refund_component) ? s + Math.abs(num(r.net ?? r.amount)) : s),
    0,
  );
  const fromNeg = negEarnings.reduce((s, r) => s + Math.abs(num(r.net)), 0);
  return fromRefunds + fromNeg;
}

export async function sumSubscriptionAndAdsExpenses(
  db: SupabaseClient,
  providerId: string,
  range?: LedgerRange
): Promise<{ total: number; asAbs: number }> {
  const rows = await fetchAllNetRows(db, providerId, [...EXPENSE_TYPES], range);
  const total = rows.reduce((s, r) => s + num(r.net ?? r.amount), 0);
  const asAbs = rows.reduce((s, r) => s + Math.abs(num(r.net ?? r.amount)), 0);
  return { total, asAbs };
}

export async function sumTipNet(
  db: SupabaseClient,
  providerId: string,
  range?: LedgerRange
): Promise<number> {
  return sumNetByTypes(db, providerId, ["tip"], range);
}

export async function sumCancellationFeeNetAbs(
  db: SupabaseClient,
  providerId: string,
  range?: LedgerRange
): Promise<number> {
  const n = await sumNetByTypes(db, providerId, ["cancellation_fee"], range);
  return Math.abs(n);
}
