import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { addDaysToYmd, dateRangeBoundsUtc, formatDateYmd, nowInTz } from "@/lib/dates/provider-tz";
import { mapStatusToProvider, type BookingStatus } from "@/lib/utils/booking-status";
import {
  dashboardBookingLocationOrFilterFallbacks,
  dashboardGroupBookingLocationOrFilter,
} from "@/lib/server/provider/dashboard-booking-location-filter";

/** DB statuses that qualify as "upcoming" on the provider dashboard. */
export const UPCOMING_BOOKING_DB_STATUSES = [
  "pending",
  "pending_payment",
  "confirmed",
  "waiting",
  "checked_in",
  "in_progress",
] as const;

const UPCOMING_GROUP_STATUSES = ["pending", "booked", "confirmed", "started", "in_progress", "waiting", "checked_in"];

export type DashboardUpcomingBooking = {
  id: string;
  booking_number: string;
  status: string;
  scheduled_at: string;
  total_amount: number;
  currency: string;
  location_type: string;
  services: Array<{
    name?: string;
    offering_name?: string;
    duration_minutes: number;
    staff_name: string | null;
    guest_name?: string | null;
  }>;
  customers: { full_name: string; phone: string } | null;
  is_group_booking?: boolean;
  group_booking_id?: string | null;
  group_booking_ref?: string | null;
  package_name?: string | null;
  products?: Array<{ product_name?: string; quantity?: number }>;
};

export const UPCOMING_BOOKINGS_BASIS =
  "Next 7 calendar days in your business timezone. Includes pending, confirmed, waiting, checked-in, and in-progress appointments from now onward. With a branch selected, at-home and walk-in appointments without a branch still appear; other salon bookings require that branch.";

function mapBookingRow(b: Record<string, unknown>): DashboardUpcomingBooking {
  const group = Array.isArray(b.group_bookings) ? (b.group_bookings as unknown[])[0] : b.group_bookings;
  const pkg = Array.isArray(b.service_packages) ? (b.service_packages as unknown[])[0] : b.service_packages;
  const groupObj = group as { ref_number?: string } | null | undefined;
  const pkgObj = pkg as { name?: string } | null | undefined;
  const customers = b.customers as { full_name?: string; phone?: string } | null | undefined;
  const bookingServices = (b.booking_services ?? []) as Array<{
    duration_minutes?: number;
    guest_name?: string | null;
    offering?: { title?: string };
    staff?: { name?: string | null };
  }>;

  return {
    id: String(b.id ?? ""),
    booking_number: String(b.booking_number ?? b.id ?? ""),
    status: mapStatusToProvider(String(b.status || "pending") as BookingStatus),
    scheduled_at: String(b.scheduled_at ?? ""),
    total_amount: Number(b.total_amount || 0),
    currency: String(b.currency || "ZAR"),
    location_type: String(b.location_type || "at_salon"),
    services: bookingServices.map((s) => ({
      name: s.offering?.title || "Service",
      offering_name: s.offering?.title || "Service",
      duration_minutes: Number(s.duration_minutes || 60),
      staff_name: s.staff?.name || null,
      guest_name: s.guest_name || null,
    })),
    customers: customers
      ? {
          full_name: String(customers.full_name || ""),
          phone: String(customers.phone || ""),
        }
      : null,
    is_group_booking: Boolean(b.is_group_booking),
    group_booking_id: (b.group_booking_id as string | null) ?? null,
    group_booking_ref: groupObj?.ref_number ?? null,
    package_name: pkgObj?.name ?? null,
    products: ((b.booking_products ?? []) as Array<{ quantity?: number; products?: { name?: string } }>).map(
      (p) => ({
        product_name: p.products?.name || "Product",
        quantity: Number(p.quantity || 1),
      }),
    ),
  };
}

function mapGroupRow(group: Record<string, unknown>): DashboardUpcomingBooking {
  const participants = Array.isArray(group.booking_participants)
    ? (group.booking_participants as Array<{
        is_primary_contact?: boolean;
        participant_name?: string;
        participant_phone?: string;
        service_name?: string;
        duration_minutes?: number;
      }>)
    : [];
  const primary = participants.find((p) => p.is_primary_contact) ?? participants[0];
  const serviceName =
    primary?.service_name || String(group.service_name || group.title || "Group booking");
  const dbStatus =
    group.status === "started"
      ? "in_progress"
      : group.status === "booked"
        ? "confirmed"
        : String(group.status || "confirmed");

  return {
    id: `group:${String(group.id ?? "")}`,
    booking_number: String(group.ref_number || group.id || ""),
    status: mapStatusToProvider(dbStatus as BookingStatus),
    scheduled_at: String(group.scheduled_at ?? ""),
    total_amount: Number(group.total_price ?? 0),
    currency: "ZAR",
    location_type: String(group.location_type || "at_salon"),
    services: [
      {
        name: serviceName,
        offering_name: serviceName,
        duration_minutes: Number(group.duration_minutes) || 60,
        staff_name: null,
        guest_name: primary?.participant_name || null,
      },
    ],
    customers: {
      full_name: primary?.participant_name || String(group.title || "Group booking"),
      phone: String(primary?.participant_phone || ""),
    },
    is_group_booking: true,
    group_booking_id: String(group.id ?? ""),
    group_booking_ref: String(group.ref_number ?? "") || null,
    package_name: null,
    products: [],
  };
}

export async function fetchUpcomingBookingsForDashboard(
  supabaseAdmin: SupabaseClient,
  params: {
    providerId: string;
    timezone: string;
    locationId?: string | null;
    limit?: number;
  },
): Promise<{ bookings: DashboardUpcomingBooking[]; basis: { upcoming: string } }> {
  const { providerId, timezone, locationId, limit = 12 } = params;
  const zNow = nowInTz(timezone);
  const todayYmd = formatDateYmd(zNow, timezone);
  const upcomingEndYmd = addDaysToYmd(todayYmd, 6);
  const { fromIso, toIso } = dateRangeBoundsUtc(todayYmd, upcomingEndYmd, timezone);
  const nowIso = new Date().toISOString();
  const rangeStartIso = fromIso > nowIso ? fromIso : nowIso;

  const bookingSelect = `
    id,
    booking_number,
    status,
    scheduled_at,
    total_amount,
    currency,
    location_type,
    location_id,
    booking_source,
    is_group_booking,
    group_booking_id,
    customers:users!bookings_customer_id_fkey(full_name, phone),
    group_bookings!bookings_group_booking_id_fkey(ref_number),
    service_packages!bookings_package_id_fkey(name),
    booking_services(
      duration_minutes,
      guest_name,
      offering:offerings(title),
      staff:provider_staff(name)
    ),
    booking_products(
      quantity,
      products:products(name)
    )
  `;

  const buildBookingsQuery = (orFilter: string | null) => {
    let q = supabaseAdmin
      .from("bookings")
      .select(bookingSelect)
      .eq("provider_id", providerId)
      .is("group_booking_id", null)
      .in("status", [...UPCOMING_BOOKING_DB_STATUSES])
      .gte("scheduled_at", rangeStartIso)
      .lte("scheduled_at", toIso)
      .order("scheduled_at", { ascending: true })
      .limit(80);
    if (orFilter) q = q.or(orFilter);
    return q;
  };

  const buildGroupQuery = (orFilter: string | null) => {
    let q = supabaseAdmin
      .from("group_bookings")
      .select(
        "id, ref_number, status, scheduled_at, total_price, location_type, location_id, title, service_name, duration_minutes, booking_participants(participant_name, participant_phone, is_primary_contact, service_name)",
      )
      .eq("provider_id", providerId)
      .in("status", UPCOMING_GROUP_STATUSES)
      .gte("scheduled_at", rangeStartIso)
      .lte("scheduled_at", toIso)
      .order("scheduled_at", { ascending: true })
      .limit(40);
    if (orFilter) q = q.or(orFilter);
    return q;
  };

  const groupFilter = locationId ? dashboardGroupBookingLocationOrFilter(locationId) : null;
  const bookingFilters = locationId ? dashboardBookingLocationOrFilterFallbacks(locationId) : [null];

  let bookingRows: unknown[] | null = null;
  for (const filter of bookingFilters) {
    const result = await buildBookingsQuery(filter);
    if (!result.error) {
      bookingRows = result.data;
      break;
    }
  }

  const { data: groupRows } = await buildGroupQuery(groupFilter);

  const merged: DashboardUpcomingBooking[] = [
    ...((bookingRows ?? []) as Record<string, unknown>[]).map(mapBookingRow),
    ...((groupRows ?? []) as Record<string, unknown>[]).map(mapGroupRow),
  ];

  merged.sort(
    (a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime(),
  );

  return {
    bookings: merged.slice(0, limit),
    basis: { upcoming: UPCOMING_BOOKINGS_BASIS },
  };
}
