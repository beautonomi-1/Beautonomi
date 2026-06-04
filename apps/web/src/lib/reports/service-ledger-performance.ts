import type { SupabaseClient } from "@supabase/supabase-js";

import { LEDGER_FULL_PROVIDER_NET_TYPES } from "@/lib/reports/constants";
import { getProviderRevenue } from "@/lib/reports/revenue-helpers";

export type ServiceLedgerRow = {
  offeringId: string;
  serviceName: string;
  bookingCount: number;
  revenue: number;
};

type BookingWithServices = {
  id: string;
  booking_services?: Array<{
    price?: number | null;
    offering_id?: string | null;
    offerings?: { id?: string; title?: string | null } | null;
  }> | null;
};

/**
 * Ledger net per completed booking (provider_earnings + travel_fee + tip), allocated
 * across offerings by each line's share of catalogue subtotal — same rules as
 * GET /api/provider/reports/sales/services.
 */
export async function buildServiceLedgerPerformance(
  supabaseAdmin: SupabaseClient,
  providerId: string,
  fromDate: Date,
  toDate: Date,
  locationId: string | null | undefined,
  timezone: string,
  options?: { status?: "completed" | "non_cancelled" },
): Promise<ServiceLedgerRow[]> {
  const statusFilter = options?.status ?? "completed";

  let bookingsQuery = supabaseAdmin
    .from("bookings")
    .select(
      `
        id,
        booking_services (
          price,
          offering_id,
          offerings:offering_id ( id, title )
        )
      `,
    )
    .eq("provider_id", providerId)
    .gte("scheduled_at", fromDate.toISOString())
    .lte("scheduled_at", toDate.toISOString());

  if (statusFilter === "completed") {
    bookingsQuery = bookingsQuery.eq("status", "completed");
  } else {
    bookingsQuery = bookingsQuery.not("status", "in", "(cancelled,no_show)");
  }

  if (locationId) {
    bookingsQuery = bookingsQuery.eq("location_id", locationId);
  }

  const { data: bookings, error } = await bookingsQuery;
  if (error) throw error;

  const ledgerOpts = {
    transactionTypes: LEDGER_FULL_PROVIDER_NET_TYPES,
    timezone,
  };
  const { revenueByBooking } = await getProviderRevenue(
    supabaseAdmin,
    providerId,
    fromDate,
    toDate,
    locationId ?? null,
    ledgerOpts,
  );

  const serviceMap = new Map<
    string,
    { offeringId: string; serviceName: string; bookingIds: Set<string>; revenue: number }
  >();

  for (const booking of (bookings ?? []) as BookingWithServices[]) {
    const services = booking.booking_services;
    if (!services?.length) continue;

    const bookingRevenue = revenueByBooking.get(booking.id) || 0;
    const totalServicePrice = services.reduce((sum, s) => sum + Number(s.price || 0), 0);

    for (const bs of services) {
      const offering = bs.offerings;
      const offeringId = offering?.id || bs.offering_id;
      if (!offeringId) continue;

      const serviceName = offering?.title || "Unknown";
      const existing = serviceMap.get(offeringId) || {
        offeringId: String(offeringId),
        serviceName,
        bookingIds: new Set<string>(),
        revenue: 0,
      };

      existing.bookingIds.add(booking.id);
      const proportion =
        totalServicePrice > 0
          ? Number(bs.price || 0) / totalServicePrice
          : 1 / services.length;
      existing.revenue += bookingRevenue * proportion;
      serviceMap.set(offeringId, existing);
    }
  }

  return Array.from(serviceMap.values())
    .map((s) => ({
      offeringId: s.offeringId,
      serviceName: s.serviceName,
      bookingCount: s.bookingIds.size,
      revenue: s.revenue,
    }))
    .sort((a, b) => b.revenue - a.revenue);
}
