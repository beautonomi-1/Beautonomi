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
import {
  CLOSE_OUT_BOOKING_SELECT,
  mirrorOfferingAliasOnCloseOutRows,
} from "@/lib/bookings/close-out-booking-select";

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
      .select(CLOSE_OUT_BOOKING_SELECT)
      .eq("provider_id", providerId)
      .in("status", OPEN_STATUSES)
      .gte("scheduled_at", lookbackIso)
      .order("scheduled_at", { ascending: true })
      .limit(300);

    if (locationId) {
      query = query.or(dashboardBookingLocationOrFilter(locationId));
    }

    const { data, error } = await query;
    if (error) {
      console.error("[close-out] query failed", {
        code: error.code,
        message: error.message,
      });
      throw error;
    }

    const { scope, staffId } = await getCalendarScopeForUser(user.id, request);
    const withOfferingAlias = mirrorOfferingAliasOnCloseOutRows(
      (data ?? []) as Parameters<typeof mirrorOfferingAliasOnCloseOutRows>[0],
    );
    const scopedRows = filterBookingsByCalendarScope(
      withOfferingAlias as Array<{
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
