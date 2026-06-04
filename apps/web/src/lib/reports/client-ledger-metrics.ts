import type { SupabaseClient } from "@supabase/supabase-js";

import { DASHBOARD_REVENUE_TRANSACTION_TYPES } from "@/lib/reports/constants";
import { getProviderRevenue } from "@/lib/reports/revenue-helpers";

/**
 * Sum ledger provider_earnings net per customer for bookings in the reporting window.
 * Bookings must already be filtered to the desired scheduled_at scope.
 */
export async function sumLedgerEarningsByCustomer(
  supabaseAdmin: SupabaseClient,
  providerId: string,
  fromDate: Date,
  toDate: Date,
  locationId: string | null | undefined,
  timezone: string,
  bookings: Array<{ id: string; customer_id: string | null }>,
): Promise<Map<string, number>> {
  const byCustomer = new Map<string, number>();
  const bookingIds = bookings.map((b) => b.id);
  if (bookingIds.length === 0) return byCustomer;

  const { revenueByBooking } = await getProviderRevenue(
    supabaseAdmin,
    providerId,
    fromDate,
    toDate,
    locationId ?? null,
    { transactionTypes: DASHBOARD_REVENUE_TRANSACTION_TYPES, timezone },
  );

  for (const b of bookings) {
    if (!b.customer_id) continue;
    const earned = revenueByBooking.get(b.id) || 0;
    if (earned === 0) continue;
    byCustomer.set(b.customer_id, (byCustomer.get(b.customer_id) || 0) + earned);
  }

  return byCustomer;
}

export const CLIENT_METRICS_BASIS_NOTE =
  "Booked gross uses booking.total_amount for appointments in the window (what was charged). " +
  "Ledger earnings uses net provider_earnings settled in the same window — comparable to Revenue report, not to booked gross.";
