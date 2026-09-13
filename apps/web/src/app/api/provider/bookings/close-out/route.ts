import { NextRequest } from "next/server";
import {
  getProviderIdForUser,
  handleApiError,
  notFoundResponse,
  requireRoleInApi,
  successResponse,
} from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getCalendarScopeForUser,
  filterBookingsByCalendarScope,
} from "@/lib/auth/calendar-scope";
import {
  enrichCloseOutRows,
  loadProviderLifecycleRow,
  summarizeCloseOutRows,
} from "@/lib/bookings/lifecycle-close-out";
import {
  dashboardBookingLocationOrFilter,
  normalizeDashboardLocationId,
} from "@/lib/server/provider/dashboard-booking-location-filter";

const OPEN_STATUSES = ["confirmed", "checked_in", "waiting", "in_progress"];

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["provider_owner", "provider_staff", "superadmin"],
      request,
    );
    const supabase = getSupabaseAdmin();
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    const locationId = normalizeDashboardLocationId(
      request.nextUrl.searchParams.get("location_id"),
    );
    const lookbackIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    let query = supabase
      .from("bookings")
      .select(
        `
        id,
        booking_number,
        scheduled_at,
        status,
        location_type,
        current_stage,
        staff_id,
        customer_id,
        customer_running_late_at,
        customer_running_late_minutes,
        customer:users!bookings_customer_id_fkey(id, full_name),
        booking_services(
          scheduled_end_at,
          duration_minutes,
          staff_id,
          offering:offerings(title, duration_minutes)
        )
      `,
      )
      .eq("provider_id", providerId)
      .in("status", OPEN_STATUSES)
      .gte("scheduled_at", lookbackIso)
      .order("scheduled_at", { ascending: true })
      .limit(300);

    if (locationId) {
      query = query.or(dashboardBookingLocationOrFilter(locationId));
    }

    const { data, error } = await query;
    if (error) throw error;

    const { scope, staffId } = await getCalendarScopeForUser(user.id, request);
    const scopedRows = filterBookingsByCalendarScope(
      (data ?? []) as Array<{
        staff_id?: string | null;
        booking_services?: Array<{ staff_id?: string | null }> | null;
      }>,
      scope,
      staffId,
    );

    const providerSettings = await loadProviderLifecycleRow(supabase, providerId);
    const rows = enrichCloseOutRows(scopedRows as never[], providerSettings);
    const summary = summarizeCloseOutRows(
      rows,
      (providerSettings as { timezone?: string | null } | null)?.timezone ?? undefined,
    );

    return successResponse({
      summary,
      bookings: rows.map((row) => ({
        ...row,
        suggestedAction: row.suggested_close_out_action,
      })),
    });
  } catch (error) {
    return handleApiError(error, "Failed to load close-out queue");
  }
}
