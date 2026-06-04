import { MAX_FINANCE_TRANSACTIONS } from "@/lib/reports/constants";

export const LEDGER_PAGE_SIZE = 1000;

/** Minimal range-pageable query surface (Supabase `.range(from, to)`). */
export interface RangePageableQuery {
  range: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>;
}

/**
 * Fetch every row for a range-pageable query using offset pagination, instead of a single
 * `.limit(N)` that silently undercounts high-volume providers. Stops at `maxRows`
 * (default {@link MAX_FINANCE_TRANSACTIONS}) as a hard safety bound.
 *
 * Shared by the provider dashboard and finance route so there is one pagination contract.
 */
export async function fetchAllLedgerPages<T = any>(
  query: RangePageableQuery,
  maxRows: number = MAX_FINANCE_TRANSACTIONS,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; from < maxRows; from += LEDGER_PAGE_SIZE) {
    const to = Math.min(from + LEDGER_PAGE_SIZE, maxRows) - 1;
    const { data, error } = await query.range(from, to);
    if (error) throw error;
    const page = (data || []) as T[];
    rows.push(...page);
    if (page.length < LEDGER_PAGE_SIZE) break;
  }
  return rows;
}
