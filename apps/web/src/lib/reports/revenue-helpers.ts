import { SupabaseClient } from "@supabase/supabase-js";

import { LEDGER_FULL_PROVIDER_NET_TYPES, MAX_FINANCE_TRANSACTIONS } from "./constants";
import { fetchAllLedgerPages } from "./fetch-all-ledger-pages";
import { filterLedgerRowsForLocation, reportDateKey } from "./provider-report-utils";
import {
  RECOGNIZED_REVENUE_TYPES,
  computeProviderRevenueBreakdown,
} from "./provider-revenue-semantics";

export type ProviderRevenueResult = {
  totalRevenue: number;
  revenueByBooking: Map<string, number>;
  revenueByProductOrder: Map<string, number>;
  revenueByDate: Map<string, number>;
  latestSettlementAtByBooking: Map<string, string>;
  latestSettlementAtByProductOrder: Map<string, string>;
};

export type ProviderRevenueOptions = {
  /**
   * Defaults to LEDGER_FULL_PROVIDER_NET_TYPES (provider_earnings + travel_fee + tip).
   * Staff payroll commission uses STAFF_COMMISSION_REVENUE_TYPES (provider_earnings only).
   * Use DASHBOARD_REVENUE_TRANSACTION_TYPES for the main provider dashboard revenue cards.
   */
  transactionTypes?: readonly string[];
  /** Provider/business timezone for daily grouping keys. */
  timezone?: string;
};

/**
 * Get provider earnings from finance_transactions
 * This returns the actual net amount the provider receives (after platform commission)
 * 
 * Note: This automatically excludes walk-in bookings paid directly (cash/yoco) because
 * those don't create finance_transactions (provider received payment directly).
 * Only includes:
 * - Online bookings (always have finance_transactions)
 * - Walk-in bookings paid via Paystack (platform holds the money, creates finance_transactions)
 *
 * Default transaction types are LEDGER_FULL_PROVIDER_NET_TYPES (provider_earnings + travel_fee + tip).
 * Pass DASHBOARD_REVENUE_TRANSACTION_TYPES or STAFF_COMMISSION_REVENUE_TYPES for provider_earnings only.
 */
export async function getProviderRevenue(
  supabaseAdmin: SupabaseClient,
  providerId: string,
  fromDate: Date,
  toDate: Date,
  locationId?: string | null,
  options?: ProviderRevenueOptions
): Promise<ProviderRevenueResult> {
  const types =
    options?.transactionTypes?.length && options.transactionTypes.length > 0
      ? [...options.transactionTypes]
      : [...LEDGER_FULL_PROVIDER_NET_TYPES];

  // Date-bounded query paginated across PostgREST max_rows pages (commonly 1000).
  const financeQuery = supabaseAdmin
    .from("finance_transactions")
    .select("id, transaction_type, amount, net, booking_id, product_order_id, created_at")
    .eq("provider_id", providerId)
    .in("transaction_type", types)
    .gte("created_at", fromDate.toISOString())
    .lte("created_at", toDate.toISOString())
    .order("created_at", { ascending: true });

  const financeTransactions = await fetchAllLedgerPages(
    financeQuery as Parameters<typeof fetchAllLedgerPages>[0],
    MAX_FINANCE_TRANSACTIONS,
  );

  const validTransactions = await filterLedgerRowsForLocation(
    supabaseAdmin,
    providerId,
    financeTransactions,
    locationId,
  );

  // Calculate total revenue
  const totalRevenue = validTransactions.reduce(
    (sum: number, t: any) => sum + Number(t.net || t.amount || 0),
    0
  );

  // Group by booking
  const revenueByBooking = new Map<string, number>();
  const revenueByProductOrder = new Map<string, number>();
  validTransactions.forEach((t: any) => {
    if (t.booking_id) {
      const current = revenueByBooking.get(t.booking_id) || 0;
      revenueByBooking.set(
        t.booking_id,
        current + Number(t.net || t.amount || 0)
      );
    } else if (t.product_order_id) {
      const current = revenueByProductOrder.get(t.product_order_id) || 0;
      revenueByProductOrder.set(
        t.product_order_id,
        current + Number(t.net || t.amount || 0)
      );
    }
  });

  // Group by date
  const revenueByDate = new Map<string, number>();
  validTransactions.forEach((t: any) => {
    const date = reportDateKey(new Date(t.created_at), options?.timezone ?? "Africa/Johannesburg");
    const current = revenueByDate.get(date) || 0;
    revenueByDate.set(date, current + Number(t.net || t.amount || 0));
  });

  /** Latest ledger timestamp per booking/order in this query window (for settlement-date UX). */
  const latestSettlementAtByBooking = new Map<string, string>();
  const latestSettlementAtByProductOrder = new Map<string, string>();
  validTransactions.forEach((t: any) => {
    const ca = typeof t.created_at === "string" ? t.created_at : String(t.created_at ?? "");
    if (!ca) return;
    if (t.booking_id) {
      const prev = latestSettlementAtByBooking.get(t.booking_id);
      if (!prev || ca > prev) latestSettlementAtByBooking.set(t.booking_id, ca);
    } else if (t.product_order_id) {
      const prev = latestSettlementAtByProductOrder.get(t.product_order_id);
      if (!prev || ca > prev) latestSettlementAtByProductOrder.set(t.product_order_id, ca);
    }
  });

  return {
    totalRevenue,
    revenueByBooking,
    revenueByProductOrder,
    revenueByDate,
    latestSettlementAtByBooking,
    latestSettlementAtByProductOrder,
  };
}

type BookingLedgerRow = {
  transaction_type: string;
  amount?: number | null;
  net?: number | null;
  booking_id?: string | null;
  refund_component?: string | null;
  created_at?: string | null;
};

/**
 * Per-booking recognized revenue net of provider refund clawbacks (ledger SSOT).
 * Used by cancellation / no-show / status reports after settlement fixes.
 */
export async function getProviderNetAfterRefundsByBooking(
  supabaseAdmin: SupabaseClient,
  providerId: string,
  fromDate: Date,
  toDate: Date,
  locationId?: string | null,
  options?: { bookingIds?: string[] },
): Promise<Map<string, number>> {
  let financeQuery = supabaseAdmin
    .from("finance_transactions")
    .select("transaction_type, amount, net, booking_id, refund_component, created_at")
    .eq("provider_id", providerId)
    .in("transaction_type", [...RECOGNIZED_REVENUE_TYPES, "refund"])
    .gte("created_at", fromDate.toISOString())
    .lte("created_at", toDate.toISOString())
    .not("booking_id", "is", null);

  if (options?.bookingIds?.length) {
    financeQuery = financeQuery.in("booking_id", options.bookingIds);
  }

  const financeTransactions = await fetchAllLedgerPages(
    financeQuery as Parameters<typeof fetchAllLedgerPages>[0],
    MAX_FINANCE_TRANSACTIONS,
  );

  const validTransactions = (await filterLedgerRowsForLocation(
    supabaseAdmin,
    providerId,
    financeTransactions,
    locationId,
  )) as BookingLedgerRow[];

  const rowsByBooking = new Map<string, BookingLedgerRow[]>();
  for (const row of validTransactions) {
    const bookingId = row.booking_id;
    if (!bookingId) continue;
    const bucket = rowsByBooking.get(bookingId) ?? [];
    bucket.push(row);
    rowsByBooking.set(bookingId, bucket);
  }

  const result = new Map<string, number>();
  for (const [bookingId, rows] of rowsByBooking) {
    result.set(bookingId, computeProviderRevenueBreakdown(rows).netAfterRefunds);
  }
  return result;
}

/** Period total recognized revenue net of provider refund clawbacks. */
export async function getProviderNetAfterRefundsTotal(
  supabaseAdmin: SupabaseClient,
  providerId: string,
  fromDate: Date,
  toDate: Date,
  locationId?: string | null,
): Promise<number> {
  const financeQuery = supabaseAdmin
    .from("finance_transactions")
    .select("transaction_type, amount, net, booking_id, product_order_id, refund_component, created_at")
    .eq("provider_id", providerId)
    .in("transaction_type", [...RECOGNIZED_REVENUE_TYPES, "refund"])
    .gte("created_at", fromDate.toISOString())
    .lte("created_at", toDate.toISOString());

  const financeTransactions = await fetchAllLedgerPages(
    financeQuery as Parameters<typeof fetchAllLedgerPages>[0],
    MAX_FINANCE_TRANSACTIONS,
  );

  const validTransactions = await filterLedgerRowsForLocation(
    supabaseAdmin,
    providerId,
    financeTransactions,
    locationId,
  );

  return computeProviderRevenueBreakdown(validTransactions as BookingLedgerRow[]).netAfterRefunds;
}

export async function getPreviousPeriodRevenue(
  supabaseAdmin: SupabaseClient,
  providerId: string,
  fromDate: Date,
  toDate: Date,
  locationId?: string | null,
  options?: ProviderRevenueOptions
): Promise<number> {
  const daysDiff = Math.ceil(
    (toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24)
  );
  const prevFromDate = new Date(fromDate.getTime() - daysDiff * 24 * 60 * 60 * 1000);
  const prevToDate = fromDate;

  const result = await getProviderRevenue(
    supabaseAdmin,
    providerId,
    prevFromDate,
    prevToDate,
    locationId,
    options
  );

  return result.totalRevenue;
}

type NetAfterRefundsLedgerRow = BookingLedgerRow & {
  product_order_id?: string | null;
};

async function fetchNetAfterRefundsLedgerRows(
  supabaseAdmin: SupabaseClient,
  providerId: string,
  fromDate: Date,
  toDate: Date,
  locationId?: string | null,
): Promise<NetAfterRefundsLedgerRow[]> {
  const financeQuery = supabaseAdmin
    .from("finance_transactions")
    .select(
      "transaction_type, amount, net, booking_id, product_order_id, refund_component, created_at",
    )
    .eq("provider_id", providerId)
    .in("transaction_type", [...RECOGNIZED_REVENUE_TYPES, "refund"])
    .gte("created_at", fromDate.toISOString())
    .lte("created_at", toDate.toISOString());

  const financeTransactions = await fetchAllLedgerPages(
    financeQuery as Parameters<typeof fetchAllLedgerPages>[0],
    MAX_FINANCE_TRANSACTIONS,
  );

  return (await filterLedgerRowsForLocation(
    supabaseAdmin,
    providerId,
    financeTransactions,
    locationId,
  )) as NetAfterRefundsLedgerRow[];
}

function groupNetAfterRefunds(
  rows: NetAfterRefundsLedgerRow[],
  timezone: string,
): ProviderRevenueResult {
  const revenueByBooking = new Map<string, number>();
  const revenueByProductOrder = new Map<string, number>();
  const revenueByDate = new Map<string, number>();
  const latestSettlementAtByBooking = new Map<string, string>();
  const latestSettlementAtByProductOrder = new Map<string, string>();

  const rowsByBooking = new Map<string, NetAfterRefundsLedgerRow[]>();
  const rowsByProductOrder = new Map<string, NetAfterRefundsLedgerRow[]>();
  const rowsByDate = new Map<string, NetAfterRefundsLedgerRow[]>();

  for (const row of rows) {
    if (row.booking_id) {
      const bucket = rowsByBooking.get(row.booking_id) ?? [];
      bucket.push(row);
      rowsByBooking.set(row.booking_id, bucket);
    } else if (row.product_order_id) {
      const bucket = rowsByProductOrder.get(row.product_order_id) ?? [];
      bucket.push(row);
      rowsByProductOrder.set(row.product_order_id, bucket);
    }

    const dateKey = reportDateKey(new Date(row.created_at ?? 0), timezone);
    const dateBucket = rowsByDate.get(dateKey) ?? [];
    dateBucket.push(row);
    rowsByDate.set(dateKey, dateBucket);

    const ca = typeof row.created_at === "string" ? row.created_at : String(row.created_at ?? "");
    if (ca && row.booking_id) {
      const prev = latestSettlementAtByBooking.get(row.booking_id);
      if (!prev || ca > prev) latestSettlementAtByBooking.set(row.booking_id, ca);
    } else if (ca && row.product_order_id) {
      const prev = latestSettlementAtByProductOrder.get(row.product_order_id);
      if (!prev || ca > prev) latestSettlementAtByProductOrder.set(row.product_order_id, ca);
    }
  }

  for (const [bookingId, bookingRows] of rowsByBooking) {
    revenueByBooking.set(bookingId, computeProviderRevenueBreakdown(bookingRows).netAfterRefunds);
  }
  for (const [orderId, orderRows] of rowsByProductOrder) {
    revenueByProductOrder.set(orderId, computeProviderRevenueBreakdown(orderRows).netAfterRefunds);
  }
  for (const [dateKey, dateRows] of rowsByDate) {
    revenueByDate.set(dateKey, computeProviderRevenueBreakdown(dateRows).netAfterRefunds);
  }

  return {
    totalRevenue: computeProviderRevenueBreakdown(rows).netAfterRefunds,
    revenueByBooking,
    revenueByProductOrder,
    revenueByDate,
    latestSettlementAtByBooking,
    latestSettlementAtByProductOrder,
  };
}

/** Headline recognized revenue net of provider refund clawbacks, with per-booking/date splits. */
export async function getProviderNetAfterRefundsDetailed(
  supabaseAdmin: SupabaseClient,
  providerId: string,
  fromDate: Date,
  toDate: Date,
  locationId?: string | null,
  options?: { timezone?: string },
): Promise<ProviderRevenueResult> {
  const rows = await fetchNetAfterRefundsLedgerRows(
    supabaseAdmin,
    providerId,
    fromDate,
    toDate,
    locationId,
  );
  return groupNetAfterRefunds(rows, options?.timezone ?? "Africa/Johannesburg");
}

export async function getPreviousPeriodNetAfterRefunds(
  supabaseAdmin: SupabaseClient,
  providerId: string,
  fromDate: Date,
  toDate: Date,
  locationId?: string | null,
): Promise<number> {
  const daysDiff = Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24));
  const prevFromDate = new Date(fromDate.getTime() - daysDiff * 24 * 60 * 60 * 1000);
  return getProviderNetAfterRefundsTotal(supabaseAdmin, providerId, prevFromDate, fromDate, locationId);
}
