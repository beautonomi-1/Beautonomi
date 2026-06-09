/**
 * PostgREST returns at most `max_rows` per request (commonly 100–1000).
 * Paginate so admin metrics include every matching row.
 */

const PAGE_SIZE = 1000;

/**
 * Default safety bound: effectively unbounded so existing callers keep paging the full
 * result set. Pass an explicit `maxRows` to stop early (mirrors
 * {@link import("@/lib/reports/fetch-all-ledger-pages").fetchAllLedgerPages}).
 */
const DEFAULT_MAX_ROWS = Number.MAX_SAFE_INTEGER;

/**
 * Paginate `.range(from, to)` until a page returns fewer than PAGE_SIZE rows, or until
 * `maxRows` rows have been fetched (whichever comes first). `maxRows` defaults to
 * effectively unbounded so callers that want every row keep their existing behavior; the
 * last page is shrunk so we never fetch more than `maxRows` rows.
 */
export async function fetchAllPaged<T>(
  fetchPage: (from: number, to: number) => Promise<{ data: T[] | null; error: unknown }>,
  maxRows: number = DEFAULT_MAX_ROWS,
): Promise<T[]> {
  const out: T[] = [];
  let from = 0;
  while (from < maxRows) {
    const to = Math.min(from + PAGE_SIZE, maxRows) - 1;
    const { data, error } = await fetchPage(from, to);
    if (error) throw error;
    const chunk = data ?? [];
    out.push(...chunk);
    if (chunk.length < to - from + 1) break;
    from += PAGE_SIZE;
  }
  return out;
}

/** Split large `.in("col", ids)` lists — very large IN clauses can fail or misbehave. */
export function chunkIds<T>(ids: T[], size: number): T[][] {
  if (ids.length === 0) return [];
  const chunks: T[][] = [];
  for (let i = 0; i < ids.length; i += size) {
    chunks.push(ids.slice(i, i + size));
  }
  return chunks;
}

/** PostgREST may return embedded many-to-one rows as object or single-element array depending on typings. */
export function unwrapEmbedded<T>(row: unknown, key: string): T | undefined {
  const v = (row as Record<string, unknown>)[key];
  if (v == null) return undefined;
  if (Array.isArray(v)) return (v[0] ?? undefined) as T | undefined;
  return v as T;
}
