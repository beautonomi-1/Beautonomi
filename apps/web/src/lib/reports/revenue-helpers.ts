import { SupabaseClient } from "@supabase/supabase-js";

import { LEDGER_FULL_PROVIDER_NET_TYPES } from "./constants";

export type ProviderRevenueOptions = {
  /**
   * Defaults to LEDGER_FULL_PROVIDER_NET_TYPES (provider_earnings + travel_fee + tip).
   * Staff payroll commission uses STAFF_COMMISSION_REVENUE_TYPES (provider_earnings only).
   * Use DASHBOARD_REVENUE_TRANSACTION_TYPES for the main provider dashboard revenue cards.
   */
  transactionTypes?: readonly string[];
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
): Promise<{
  totalRevenue: number;
  revenueByBooking: Map<string, number>;
  revenueByDate: Map<string, number>;
}> {
  const types =
    options?.transactionTypes?.length && options.transactionTypes.length > 0
      ? [...options.transactionTypes]
      : [...LEDGER_FULL_PROVIDER_NET_TYPES];

  // Date-bounded query: do not cap rows — a capped query would undercount high-volume providers.
  const { data: financeTransactions } = await supabaseAdmin
    .from("finance_transactions")
    .select("id, transaction_type, amount, net, booking_id, created_at")
    .eq("provider_id", providerId)
    .in("transaction_type", types)
    .gte("created_at", fromDate.toISOString())
    .lte("created_at", toDate.toISOString());

  // Get booking information for filtering by location if needed
  const financeBookingIds = [
    ...new Set(
      (financeTransactions || [])
        .filter((t: any) => t.booking_id)
        .map((t: any) => t.booking_id)
    ),
  ];
  let bookingMap: Record<string, { location_id: string | null }> = {};

  if (locationId && financeBookingIds.length > 0) {
    const { data: bookingsForFinance } = await supabaseAdmin
      .from("bookings")
      .select("id, location_id")
      .in("id", financeBookingIds);

    if (bookingsForFinance) {
      bookingMap = bookingsForFinance.reduce((acc: any, b: any) => {
        acc[b.id] = { location_id: b.location_id || null };
        return acc;
      }, {});
    }
  }

  // Filter transactions by location if needed
  const validTransactions = (financeTransactions || []).filter((t: any) => {
    if (locationId) {
      if (!t.booking_id) return false;
      if (bookingMap[t.booking_id]?.location_id !== locationId) return false;
    }
    return true;
  });

  // Calculate total revenue
  const totalRevenue = validTransactions.reduce(
    (sum: number, t: any) => sum + Number(t.net || t.amount || 0),
    0
  );

  // Group by booking
  const revenueByBooking = new Map<string, number>();
  validTransactions.forEach((t: any) => {
    if (t.booking_id) {
      const current = revenueByBooking.get(t.booking_id) || 0;
      revenueByBooking.set(
        t.booking_id,
        current + Number(t.net || t.amount || 0)
      );
    }
  });

  // Group by date
  const revenueByDate = new Map<string, number>();
  validTransactions.forEach((t: any) => {
    const date = new Date(t.created_at).toISOString().split("T")[0];
    const current = revenueByDate.get(date) || 0;
    revenueByDate.set(date, current + Number(t.net || t.amount || 0));
  });

  return {
    totalRevenue,
    revenueByBooking,
    revenueByDate,
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
