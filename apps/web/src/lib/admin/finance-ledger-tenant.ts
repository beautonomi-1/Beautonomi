import type { SupabaseClient } from "@supabase/supabase-js";

/** Ledger fields used by admin finance summary (deduped by id). */
export type FinanceLedgerRow = {
  id: string;
  transaction_type: string;
  booking_id?: string | null;
  product_order_id?: string | null;
  provider_id?: string | null;
  amount?: number | null;
  fees?: number | null;
  commission?: number | null;
  net?: number | null;
  created_at?: string | null;
  refund_component?: string | null;
};

const LEDGER_SELECT =
  "id, booking_id, product_order_id, provider_id, transaction_type, amount, fees, commission, net, created_at, refund_component";

export type FetchFinanceLedgerRange = {
  start?: string | null;
  end?: string | null;
};

export function normalizeAdminLedgerRange(range: FetchFinanceLedgerRange): FetchFinanceLedgerRange {
  const normalizeStart = (value?: string | null) => {
    if (!value) return value;
    return /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00.000Z` : value;
  };
  const normalizeEnd = (value?: string | null) => {
    if (!value) return value;
    return /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T23:59:59.999Z` : value;
  };
  return {
    start: normalizeStart(range.start),
    end: normalizeEnd(range.end),
  };
}

export type FetchFinanceLedgerOptions = {
  /** When set (and not `"all"`), filter both ledger queries to this transaction_type. */
  transactionType?: string | null;
  transactionTypes?: string[] | null;
  /** Narrow both ledger branches to these provider ids (ft.provider_id or booking.provider_id). */
  restrictProviderIds?: string[] | null;
  /** Narrow both branches to these booking ids (ft.booking_id). */
  restrictBookingIds?: string[] | null;
};

/** Optional filters applied to both provider- and booking-scoped ledger queries (merged export / list). */
export type FinanceLedgerMergedQueryOptions = {
  transactionType?: string | null;
  transactionTypes?: string[] | null;
  statusIn?: string[] | null;
  amountGte?: number | null;
  /** Narrow both ledger branches to these provider ids (ft.provider_id or booking.provider_id). */
  restrictProviderIds?: string[] | null;
  /** Narrow both branches to these booking ids (ft.booking_id). */
  restrictBookingIds?: string[] | null;
};

/**
 * Merge provider-scoped and booking-scoped ledger fetches: same id appears at most once.
 * Rows from the provider path win on duplicate ids (matches PostgREST inner-join shape).
 */
export function mergeLedgerRowsByIdPreferProvider<T extends { id: string }>(
  providerPathRows: T[],
  bookingPathRows: T[]
): T[] {
  const byId = new Map<string, T>();
  for (const row of providerPathRows) {
    if (row.id) byId.set(row.id, row);
  }
  for (const row of bookingPathRows) {
    if (row.id && !byId.has(row.id)) byId.set(row.id, row);
  }
  return Array.from(byId.values());
}

function stripLedgerEmbeds(
  row: FinanceLedgerRow & { providers?: unknown; bookings?: unknown }
): FinanceLedgerRow {
  const { providers: _p, bookings: _b, ...rest } = row;
  void _p;
  void _b;
  return rest;
}

const EXPORT_SELECT_PROVIDER =
  "*, providers!inner(tenant_id), booking:bookings(id, booking_number, customer_id, provider_id, tenant_id)";
const EXPORT_SELECT_BOOKING =
  "*, bookings!inner(id, booking_number, customer_id, provider_id, tenant_id)";
const LEDGER_PAGE_SIZE = 1000;

async function fetchAllPages<T>(query: any): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += LEDGER_PAGE_SIZE) {
    const to = from + LEDGER_PAGE_SIZE - 1;
    const { data, error } = await query.range(from, to);
    if (error) throw error;
    const page = (data || []) as T[];
    rows.push(...page);
    if (page.length < LEDGER_PAGE_SIZE) break;
  }
  return rows;
}

export type FinanceExportRow = Record<string, unknown> & {
  id: string;
  booking?: {
    booking_number?: string;
    provider_id?: string;
    customer_id?: string;
  } | null;
};

function normalizeFinanceExportRow(row: Record<string, unknown>): FinanceExportRow {
  const { providers: _p, bookings: bookingJoin, booking: bookingEmbed, ...rest } = row;
  void _p;
  const fromJoin =
    bookingJoin && typeof bookingJoin === "object" && !Array.isArray(bookingJoin)
      ? (bookingJoin as FinanceExportRow["booking"])
      : null;
  const b =
    (bookingEmbed && typeof bookingEmbed === "object" && !Array.isArray(bookingEmbed)
      ? (bookingEmbed as FinanceExportRow["booking"])
      : null) ?? fromJoin;
  return { ...rest, id: String(rest.id), booking: b } as FinanceExportRow;
}

/** Provider attribution for merged export rows (direct column or via booking join). */
export function resolveFinanceLedgerRowProviderId(row: FinanceExportRow): string | null {
  const direct = row.provider_id;
  if (typeof direct === "string" && direct) return direct;
  const fromBooking = row.booking?.provider_id;
  if (typeof fromBooking === "string" && fromBooking) return fromBooking;
  return null;
}

/** Customer on the booking embed (payment / charge rows). */
export function resolveFinanceLedgerRowCustomerId(row: FinanceExportRow): string | null {
  const fromBooking = row.booking?.customer_id;
  if (typeof fromBooking === "string" && fromBooking) return fromBooking;
  return null;
}

/**
 * Full finance_transactions rows for CSV export: tenant via provider OR booking (deduped).
 */
function applyMergedLedgerFilters(
  q1: any,
  q2: any,
  options?: FinanceLedgerMergedQueryOptions | null
): [any, any] {
  let a = q1;
  let b = q2;
  const tt = options?.transactionType && options.transactionType !== "all" ? options.transactionType : null;
  const tts = options?.transactionTypes?.filter(Boolean) ?? [];
  if (tt) {
    a = a.eq("transaction_type", tt);
    b = b.eq("transaction_type", tt);
  } else if (tts.length > 0) {
    a = a.in("transaction_type", tts);
    b = b.in("transaction_type", tts);
  }
  if (options?.statusIn && options.statusIn.length > 0) {
    a = a.in("status", options.statusIn);
    b = b.in("status", options.statusIn);
  }
  if (options?.amountGte != null) {
    a = a.gte("amount", options.amountGte);
    b = b.gte("amount", options.amountGte);
  }
  if (options?.restrictProviderIds && options.restrictProviderIds.length > 0) {
    const ids = options.restrictProviderIds;
    a = a.in("provider_id", ids);
    b = b.in("bookings.provider_id", ids);
  }
  if (options?.restrictBookingIds && options.restrictBookingIds.length > 0) {
    const bids = options.restrictBookingIds;
    a = a.in("booking_id", bids);
    b = b.in("booking_id", bids);
  }
  return [a, b] as const;
}

export async function fetchFinanceLedgerExportRowsForTenant(
  supabase: SupabaseClient,
  tenantId: string,
  range: FetchFinanceLedgerRange,
  options?: FinanceLedgerMergedQueryOptions | null
): Promise<FinanceExportRow[]> {
  const normalizedRange = normalizeAdminLedgerRange(range);
  let q1 = supabase
    .from("finance_transactions")
    .select(EXPORT_SELECT_PROVIDER)
    .eq("providers.tenant_id", tenantId);

  let q2 = supabase
    .from("finance_transactions")
    .select(EXPORT_SELECT_BOOKING)
    .eq("bookings.tenant_id", tenantId)
    .not("booking_id", "is", null);

  [q1, q2] = applyMergedLedgerFilters(q1, q2, options);

  if (normalizedRange.start) {
    q1 = q1.gte("created_at", normalizedRange.start);
    q2 = q2.gte("created_at", normalizedRange.start);
  }
  if (normalizedRange.end) {
    q1 = q1.lte("created_at", normalizedRange.end);
    q2 = q2.lte("created_at", normalizedRange.end);
  }

  const [providerRows, bookingRows] = await Promise.all([
    fetchAllPages<Record<string, unknown>>(q1),
    fetchAllPages<Record<string, unknown>>(q2),
  ]);

  const a = providerRows.map((row) => normalizeFinanceExportRow(row));
  const b = bookingRows.map((row) => normalizeFinanceExportRow(row));
  const merged = mergeLedgerRowsByIdPreferProvider(a, b);
  merged.sort((x, y) => {
    const ax = x.created_at ? String(x.created_at) : "";
    const ay = y.created_at ? String(y.created_at) : "";
    return ay.localeCompare(ax);
  });
  return merged;
}

/**
 * Merged ledger rows for admin activity widgets: each branch is capped, then merged and sorted.
 */
export async function fetchMergedFinanceLedgerSliceForTenant(
  supabase: SupabaseClient,
  tenantId: string,
  range: FetchFinanceLedgerRange,
  options: FinanceLedgerMergedQueryOptions | null,
  take: number,
  sortBy: "created_at" | "amount" = "created_at",
  amountDesc = false
): Promise<FinanceExportRow[]> {
  const normalizedRange = normalizeAdminLedgerRange(range);
  const perBranchCap = Math.min(200, Math.max(take * 4, take));
  let q1 = supabase
    .from("finance_transactions")
    .select(EXPORT_SELECT_PROVIDER)
    .eq("providers.tenant_id", tenantId);

  let q2 = supabase
    .from("finance_transactions")
    .select(EXPORT_SELECT_BOOKING)
    .eq("bookings.tenant_id", tenantId)
    .not("booking_id", "is", null);

  [q1, q2] = applyMergedLedgerFilters(q1, q2, options);

  if (normalizedRange.start) {
    q1 = q1.gte("created_at", normalizedRange.start);
    q2 = q2.gte("created_at", normalizedRange.start);
  }
  if (normalizedRange.end) {
    q1 = q1.lte("created_at", normalizedRange.end);
    q2 = q2.lte("created_at", normalizedRange.end);
  }

  q1 = q1.order(sortBy, { ascending: sortBy === "amount" ? !amountDesc : false }).limit(perBranchCap);
  q2 = q2.order(sortBy, { ascending: sortBy === "amount" ? !amountDesc : false }).limit(perBranchCap);

  const [r1, r2] = await Promise.all([q1, q2]);
  if (r1.error) throw r1.error;
  if (r2.error) throw r2.error;

  const a = (r1.data || []).map((row) => normalizeFinanceExportRow(row as Record<string, unknown>));
  const b = (r2.data || []).map((row) => normalizeFinanceExportRow(row as Record<string, unknown>));
  const merged = mergeLedgerRowsByIdPreferProvider(a, b);
  merged.sort((x, y) => {
    if (sortBy === "amount") {
      const ax = Number(x.amount ?? 0);
      const ay = Number(y.amount ?? 0);
      return amountDesc ? ay - ax : ax - ay;
    }
    const tx = x.created_at ? String(x.created_at) : "";
    const ty = y.created_at ? String(y.created_at) : "";
    return ty.localeCompare(tx);
  });
  return merged.slice(0, take);
}

/**
 * Finance rows for a market: provider in tenant OR booking in tenant (deduped).
 * Catches ledger rows with null/mismatched provider_id that still belong via booking_id.
 */
export async function fetchFinanceLedgerRowsForTenant(
  supabase: SupabaseClient,
  tenantId: string,
  range: FetchFinanceLedgerRange,
  options?: FetchFinanceLedgerOptions
): Promise<FinanceLedgerRow[]> {
  const normalizedRange = normalizeAdminLedgerRange(range);
  let q1 = supabase
    .from("finance_transactions")
    .select(`${LEDGER_SELECT}, providers!inner(tenant_id)`)
    .eq("providers.tenant_id", tenantId);

  let q2 = supabase
    .from("finance_transactions")
    .select(`${LEDGER_SELECT}, bookings!inner(tenant_id, provider_id)`)
    .eq("bookings.tenant_id", tenantId)
    .not("booking_id", "is", null);

  if (options?.restrictProviderIds && options.restrictProviderIds.length > 0) {
    const ids = options.restrictProviderIds;
    q1 = q1.in("provider_id", ids);
    q2 = q2.in("bookings.provider_id", ids);
  }
  if (options?.restrictBookingIds && options.restrictBookingIds.length > 0) {
    const bids = options.restrictBookingIds;
    q1 = q1.in("booking_id", bids);
    q2 = q2.in("booking_id", bids);
  }

  const tt = options?.transactionType && options.transactionType !== "all" ? options.transactionType : null;
  const tts = options?.transactionTypes?.filter(Boolean) ?? [];
  if (tt) {
    q1 = q1.eq("transaction_type", tt);
    q2 = q2.eq("transaction_type", tt);
  } else if (tts.length > 0) {
    q1 = q1.in("transaction_type", tts);
    q2 = q2.in("transaction_type", tts);
  }
  if (normalizedRange.start) {
    q1 = q1.gte("created_at", normalizedRange.start);
    q2 = q2.gte("created_at", normalizedRange.start);
  }
  if (normalizedRange.end) {
    q1 = q1.lte("created_at", normalizedRange.end);
    q2 = q2.lte("created_at", normalizedRange.end);
  }

  const [providerRows, bookingRows] = await Promise.all([
    fetchAllPages<FinanceLedgerRow & { providers?: unknown; bookings?: unknown }>(q1),
    fetchAllPages<FinanceLedgerRow & { providers?: unknown; bookings?: unknown }>(q2),
  ]);

  const rows1 = providerRows.map((row) =>
    stripLedgerEmbeds(row as FinanceLedgerRow & { providers?: unknown; bookings?: unknown })
  );
  const rows2 = bookingRows.map((row) =>
    stripLedgerEmbeds(row as FinanceLedgerRow & { providers?: unknown; bookings?: unknown })
  );
  return mergeLedgerRowsByIdPreferProvider(rows1, rows2);
}
