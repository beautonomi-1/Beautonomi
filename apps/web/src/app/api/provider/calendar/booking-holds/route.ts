import { NextRequest } from "next/server";
import {
  requireRoleInApi,
  getProviderIdForUser,
  successResponse,
  notFoundResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  addOneDayYmd,
  dateRangeBoundsUtc,
  formatInTz,
} from "@/lib/dates/provider-tz";
import { getProviderReportContext } from "@/lib/reports/provider-report-utils";
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
 *
 * Date params match the provider portal calendar — each YMD is a wall date in
 * `providers.timezone` (same as `formatDateKeyInTimeZone` + `dateRangeBoundsUtc`
 * in `fetch-calendar-initial.ts`). Range filtering uses those bounds, not
 * naive UTC midnight on the string.
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

    const { timezone: tz } = await getProviderReportContext(supabase, providerId);

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

    const { fromIso } = dateRangeBoundsUtc(dateFrom, dateTo, tz);
    const rangeExclusiveEndIso = dateRangeBoundsUtc(
      addOneDayYmd(dateTo),
      addOneDayYmd(dateTo),
      tz,
    ).fromIso;
    const nowIso = new Date().toISOString();

    const { data, error } = await supabase
      .from("booking_holds")
      .select(
        "id, staff_id, start_at, end_at, hold_status, expires_at, metadata",
      )
      .eq("provider_id", providerId)
      .in("hold_status", ["active", "consuming"])
      .gt("expires_at", nowIso)
      .lt("start_at", rangeExclusiveEndIso)
      .gt("end_at", fromIso);

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

      // Split across day boundaries using the provider timezone (aligned with
      // CalendarGrid `formatDateKeyInTimeZone` / staff unavailability splitting).
      let cursor = new Date(startDate.getTime());
      while (cursor < endDate) {
        const ymd = formatInTz(cursor, "yyyy-MM-dd", tz);
        const { fromIso: dayStartIso, toIso: dayEndIso } = dateRangeBoundsUtc(
          ymd,
          ymd,
          tz,
        );
        const dayStart = new Date(dayStartIso);
        const dayEndIncl = new Date(dayEndIso);
        const segStart =
          cursor.getTime() < dayStart.getTime() ? dayStart : cursor;
        const segEnd =
          endDate.getTime() < dayEndIncl.getTime() ? endDate : dayEndIncl;
        const startTime = formatInTz(segStart, "HH:mm", tz);
        let endTime = formatInTz(segEnd, "HH:mm", tz);

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

        const nextYmd = addOneDayYmd(ymd);
        cursor = new Date(
          dateRangeBoundsUtc(nextYmd, nextYmd, tz).fromIso,
        );
      }
    }

    return successResponse(display);
  } catch (error) {
    return handleApiError(error, "Failed to load booking holds");
  }
}
