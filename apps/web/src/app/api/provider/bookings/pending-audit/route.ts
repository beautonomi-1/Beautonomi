import { NextRequest } from "next/server";
import {
  requireRoleInApi,
  getProviderIdForUser,
  successResponse,
  notFoundResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  PENDING_REVIEW_DB_STATUSES,
  classifyPendingBookingVisibility,
} from "@/lib/server/provider/pending-bookings-scope";
import { dashboardBookingLocationOrFilter } from "@/lib/server/provider/dashboard-booking-location-filter";

/**
 * GET /api/provider/bookings/pending-audit?location_id=
 *
 * Support/diagnostic: every pending review booking for this provider, with why
 * the bookings list would or would not render it. Provider owners + superadmin only.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "superadmin"], request);
    const supabaseAdmin = getSupabaseAdmin();
    const providerId = await getProviderIdForUser(user.id, supabaseAdmin);
    if (!providerId) return notFoundResponse("Provider not found");

    const locationId = request.nextUrl.searchParams.get("location_id")?.trim() || undefined;

    let bookingsQuery = supabaseAdmin
      .from("bookings")
      .select("id, booking_number, status, scheduled_at, group_booking_id, location_id, location_type")
      .eq("provider_id", providerId)
      .in("status", [...PENDING_REVIEW_DB_STATUSES]);

    if (locationId) {
      bookingsQuery = bookingsQuery.or(dashboardBookingLocationOrFilter(locationId));
    }

    const { data: pendingBookings, error: bookingsError } = await bookingsQuery.order(
      "scheduled_at",
      { ascending: true },
    );
    if (bookingsError) throw bookingsError;

    const groupIds = [
      ...new Set(
        (pendingBookings ?? [])
          .map((b: { group_booking_id?: string | null }) => b.group_booking_id)
          .filter((id): id is string => typeof id === "string" && id.length > 0),
      ),
    ];

    const groupById = new Map<
      string,
      {
        id: string;
        status: string;
        location_id?: string | null;
        location_type?: string | null;
        ref_number?: string | null;
      }
    >();

    if (groupIds.length > 0) {
      const { data: groups, error: groupsError } = await supabaseAdmin
        .from("group_bookings")
        .select("id, status, location_id, location_type, ref_number")
        .eq("provider_id", providerId)
        .in("id", groupIds);
      if (groupsError) throw groupsError;
      for (const g of groups ?? []) {
        groupById.set((g as { id: string }).id, g as typeof groupById extends Map<string, infer V> ? V : never);
      }
    }

    const rows = (pendingBookings ?? []).map(
      (booking: {
        id: string;
        booking_number?: string | null;
        status: string;
        scheduled_at?: string | null;
        group_booking_id?: string | null;
      }) => {
        const groupBooking = booking.group_booking_id
          ? (groupById.get(booking.group_booking_id) ?? null)
          : null;
        const visibility = classifyPendingBookingVisibility({
          booking,
          groupBooking,
          locationId,
        });
        return {
          booking_id: booking.id,
          booking_number: booking.booking_number ?? null,
          status: booking.status,
          scheduled_at: booking.scheduled_at ?? null,
          group_booking_id: booking.group_booking_id ?? null,
          group_ref: groupBooking?.ref_number ?? null,
          group_status: groupBooking?.status ?? null,
          list_visibility: visibility.list_visibility,
          would_count_in_nav: visibility.would_count_in_nav,
          would_count_in_nav_before_fix: booking.group_booking_id ? true : visibility.would_count_in_nav,
          would_show_in_list: visibility.would_show_in_list,
        };
      },
    );

    const hidden = rows.filter((r) => !r.would_show_in_list);
    const visible = rows.filter((r) => r.would_show_in_list);

    return successResponse({
      provider_id: providerId,
      location_id: locationId ?? null,
      total_pending_booking_rows: rows.length,
      visible_in_list: visible.length,
      hidden_from_list: hidden.length,
      hidden_breakdown: hidden.reduce(
        (acc, row) => {
          acc[row.list_visibility] = (acc[row.list_visibility] ?? 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      ),
      rows,
    });
  } catch (error) {
    return handleApiError(error, "Failed to audit pending bookings");
  }
}
