import { isPostgrestRangeUnsatisfiable } from "@/lib/provider-ops/postgrest-unbounded";
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
export type FetchAllLedgerPagesResult<T> = {
  rows: T[];
  /** True when more ledger rows exist beyond `maxRows` (provider report cap). */
  truncated: boolean;
};

export async function fetchAllLedgerPagesWithMeta<T = unknown>(
  query: RangePageableQuery,
  maxRows: number = MAX_FINANCE_TRANSACTIONS,
): Promise<FetchAllLedgerPagesResult<T>> {
  const rows: T[] = [];
  let truncated = false;
  for (let from = 0; from < maxRows; from += LEDGER_PAGE_SIZE) {
    const to = Math.min(from + LEDGER_PAGE_SIZE, maxRows) - 1;
    const { data, error } = await query.range(from, to);
    if (error) {
      if (isPostgrestRangeUnsatisfiable(error)) break;
      throw error;
    }
    const page = (data || []) as T[];
    rows.push(...page);
    if (page.length < LEDGER_PAGE_SIZE) break;
    if (rows.length >= maxRows) {
      truncated = true;
      break;
    }
  }
  return { rows: rows.slice(0, maxRows), truncated };
}

export async function fetchAllLedgerPages<T = unknown>(
  query: RangePageableQuery,
  maxRows: number = MAX_FINANCE_TRANSACTIONS,
): Promise<T[]> {
  const { rows } = await fetchAllLedgerPagesWithMeta<T>(query, maxRows);
  return rows;
}
