import { NextRequest } from "next/server";
import {
  requireRoleInApi,
  getProviderIdForUser,
  successResponse,
  notFoundResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { getSupabaseServer } from "@/lib/supabase/server";
import { format } from "date-fns";
import type { AvailabilityBlockDisplay } from "@/lib/provider-portal/types";

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /api/provider/calendar/booking-holds
 * Query: date_from, date_to (YYYY-MM-DD)
 *
 * B8: Returns currently-active booking_holds for this provider in the range,
 * shaped as AvailabilityBlockDisplay so the calendar renders them as ghost
 * slots alongside staff unavailability / availability blocks. Holds in
 * `consuming` state are also surfaced (they are guaranteed-soon bookings) so
 * we don't accidentally double-book while the checkout finalises.
 *
 * Note: expired / cancelled / consumed holds are intentionally excluded.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["provider_owner", "provider_staff", "superadmin"],
      request,
    );
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const { searchParams } = new URL(request.url);
    const dateFrom = searchParams.get("date_from")?.trim() ?? "";
    const dateTo = searchParams.get("date_to")?.trim() ?? "";

    if (!YMD.test(dateFrom) || !YMD.test(dateTo)) {
      return handleApiError(
        new Error("date_from and date_to are required (YYYY-MM-DD)"),
        "Validation failed",
        "VALIDATION_ERROR",
        400,
      );
    }

    // We use inclusive-exclusive bounds in UTC so the range covers the full
    // local span even when hold rows were stored in a different offset.
    const rangeStart = `${dateFrom}T00:00:00Z`;
    const rangeEnd = `${dateTo}T23:59:59Z`;
    const nowIso = new Date().toISOString();

    const { data, error } = await supabase
      .from("booking_holds")
      .select(
        "id, staff_id, start_at, end_at, hold_status, expires_at, metadata",
      )
      .eq("provider_id", providerId)
      .in("hold_status", ["active", "consuming"])
      .gt("expires_at", nowIso)
      .lt("start_at", rangeEnd)
      .gt("end_at", rangeStart);

    if (error) {
      if (error.code === "42P01") {
        // Table missing in this environment — degrade gracefully.
        return successResponse([] as AvailabilityBlockDisplay[]);
      }
      throw error;
    }

    const rows = (data ?? []) as Array<{
      id: string;
      staff_id: string | null;
      start_at: string;
      end_at: string;
      hold_status: string;
      expires_at: string | null;
      metadata: Record<string, unknown> | null;
    }>;

    const display: AvailabilityBlockDisplay[] = [];
    for (const row of rows) {
      const startDate = new Date(row.start_at);
      const endDate = new Date(row.end_at);
      if (
        Number.isNaN(startDate.getTime()) ||
        Number.isNaN(endDate.getTime())
      ) {
        continue;
      }

      // Split across day boundaries the same way the staff unavailability
      // builder does, so the grid can place each day's segment under the
      // correct column.
      let cursor = new Date(startDate);
      while (cursor < endDate) {
        const dayStart = new Date(
          cursor.getFullYear(),
          cursor.getMonth(),
          cursor.getDate(),
        );
        const dayEnd = new Date(dayStart);
        dayEnd.setDate(dayEnd.getDate() + 1);
        const segStart = cursor < dayStart ? dayStart : cursor;
        const segEnd = endDate < dayEnd ? endDate : dayEnd;
        const ymd = format(segStart, "yyyy-MM-dd");
        const startTime = format(segStart, "HH:mm");
        const endTime = format(segEnd, "HH:mm");

        const isConsuming = row.hold_status === "consuming";
        const reasonLabel = isConsuming
          ? "Booking in progress (checkout)"
          : "Booking hold";

        display.push({
          id: `hold-${row.id}-${ymd}`,
          date: ymd,
          start_time: startTime,
          end_time: endTime === "00:00" ? "23:59" : endTime,
          team_member_id: row.staff_id,
          location_id: null,
          block_type: "hold",
          reason: reasonLabel,
          _source: "booking_hold",
          hold_id: row.id,
          hold_expires_at: row.expires_at,
        });

        cursor = dayEnd;
      }
    }

    return successResponse(display);
  } catch (error) {
    return handleApiError(error, "Failed to load booking holds");
  }
}
