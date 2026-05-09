import { SupabaseClient } from "@supabase/supabase-js";

import { LEDGER_FULL_PROVIDER_NET_TYPES } from "./constants";
import { filterLedgerRowsForLocation, reportDateKey } from "./provider-report-utils";

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

  // Date-bounded query: do not cap rows — a capped query would undercount high-volume providers.
  const { data: financeTransactions } = await supabaseAdmin
    .from("finance_transactions")
    .select("id, transaction_type, amount, net, booking_id, product_order_id, created_at")
    .eq("provider_id", providerId)
    .in("transaction_type", types)
    .gte("created_at", fromDate.toISOString())
    .lte("created_at", toDate.toISOString());

  const validTransactions = await filterLedgerRowsForLocation(
    supabaseAdmin,
    providerId,
    financeTransactions || [],
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

/**
 * Get provider revenue for previous period (for growth calculations)
 */
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
