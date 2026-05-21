import { NextRequest } from "next/server";
import { addDays, differenceInCalendarDays } from "date-fns";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import {
  addOneDayYmd,
  dateRangeBoundsUtc,
  formatDateYmd,
  formatInTz,
  getDayInTz,
} from "@/lib/dates/provider-tz";
import { getProviderReportContext } from "@/lib/reports/provider-report-utils";
import { resolveLocationHoursDay } from "@/lib/availability/location-hours-fallback";
import { z } from "zod";

const createShiftSchema = z.object({
  staff_id: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start_time: z.string().regex(/^\d{2}:\d{2}$/),
  end_time: z.string().regex(/^\d{2}:\d{2}$/),
  notes: z.string().optional(),
  is_recurring: z.boolean().optional(),
  recurring_pattern: z.any().optional(),
});

function utcStartOfYmd(ymd: string, tz: string): Date {
  return new Date(dateRangeBoundsUtc(ymd, ymd, tz).fromIso);
}

function calendarDaysBetween(fromYmd: string, toYmd: string, tz: string): number {
  return differenceInCalendarDays(utcStartOfYmd(toYmd, tz), utcStartOfYmd(fromYmd, tz));
}

function monthsBetweenYmd(anchorYmd: string, targetYmd: string, tz: string): number {
  const a = utcStartOfYmd(anchorYmd, tz);
  const t = utcStartOfYmd(targetYmd, tz);
  const ay = Number(formatInTz(a, "yyyy", tz));
  const am = Number(formatInTz(a, "M", tz));
  const ty = Number(formatInTz(t, "yyyy", tz));
  const tm = Number(formatInTz(t, "M", tz));
  return (ty - ay) * 12 + (tm - am);
}

/**
 * Recurring shift applicability using the provider timezone — aligned with
 * provider calendar `formatDateKeyInTimeZone` / `week_start` from the portal.
 */
function shiftAppliesOnDate(shift: any, date: string, tz: string): boolean {
  if (!shift.is_recurring) return shift.date === date;

  const rule = shift.recurring_pattern && typeof shift.recurring_pattern === "object"
    ? shift.recurring_pattern
    : {};
  const pattern = String(rule.pattern || rule.frequency || (rule.type === "alternating" ? "biweekly" : "weekly"));
  const anchorYmd = String(shift.date).slice(0, 10);
  if (date < anchorYmd) return false;

  const endRule = rule.end_date != null ? String(rule.end_date).slice(0, 10) : null;
  if (endRule && date > endRule) return false;

  const intervalRaw = Number(rule.interval || (pattern === "biweekly" ? 2 : 1));
  const interval = Number.isFinite(intervalRaw) && intervalRaw > 0 ? intervalRaw : 1;
  const diffDays = calendarDaysBetween(anchorYmd, date, tz);
  let occurrenceIndex: number | null = null;
  let applies = false;

  if (pattern === "daily") {
    applies = diffDays % interval === 0;
    occurrenceIndex = Math.floor(diffDays / interval) + 1;
  } else if (pattern === "weekly" || pattern === "biweekly") {
    const explicitDays = Array.isArray(rule.days) ? rule.days : Array.isArray(rule.days_of_week) ? rule.days_of_week : null;
    const targetDow = getDayInTz(utcStartOfYmd(date, tz), tz);
    if (explicitDays && explicitDays.length > 0) {
      applies = explicitDays.includes(targetDow) && Math.floor(diffDays / 7) % interval === 0;
      if (applies) {
        let count = 0;
        for (let cursorYmd = anchorYmd; cursorYmd <= date; cursorYmd = addOneDayYmd(cursorYmd)) {
          const dow = getDayInTz(utcStartOfYmd(cursorYmd, tz), tz);
          if (
            explicitDays.includes(dow) &&
            Math.floor(calendarDaysBetween(anchorYmd, cursorYmd, tz) / 7) % interval === 0
          ) {
            count += 1;
          }
        }
        occurrenceIndex = count;
      }
    } else {
      const anchorDow = getDayInTz(utcStartOfYmd(anchorYmd, tz), tz);
      const weeks = Math.floor(diffDays / 7);
      applies = targetDow === anchorDow && weeks % interval === 0;
      occurrenceIndex = applies ? Math.floor(weeks / interval) + 1 : null;
    }
  } else if (pattern === "monthly") {
    const months = monthsBetweenYmd(anchorYmd, date, tz);
    const anchorDom = Number(formatInTz(utcStartOfYmd(anchorYmd, tz), "d", tz));
    const targetDom = Number(formatInTz(utcStartOfYmd(date, tz), "d", tz));
    applies = targetDom === anchorDom && months >= 0 && months % interval === 0;
    occurrenceIndex = applies ? Math.floor(months / interval) + 1 : null;
  }

  const endsAfter = Number(rule.ends_after || rule.occurrences || 0);
  if (applies && endsAfter > 0 && occurrenceIndex && occurrenceIndex > endsAfter) return false;
  return applies;
}

/**
 * GET /api/provider/shifts
 * 
 * Get provider's staff shifts merged with weekly schedules.
 * Returns date-specific staff_shifts first, then fills gaps with
 * staff_schedules (weekly template) so the grid always shows the
 * effective schedule.
 *
 * Query params: week_start (YYYY-MM-DD), staff_id (optional)
 *
 * Response rows: `source` is `shift` for real `staff_shifts` rows (UUID `id`, PATCHable).
 * Rows with `source` `schedule` or `location` use synthetic string ids (`schedule-…`, `location-…`);
 * those ids must not be sent to PATCH/DELETE — use POST to create a real override first.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);

    const supabase = await getSupabaseServer(request);
    const searchParams = request.nextUrl.searchParams;
    const weekStart = searchParams.get('week_start');
    const staffId = searchParams.get('staff_id');

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const { timezone: tz } = await getProviderReportContext(supabase, providerId);

    let shiftQuery = supabase
      .from("staff_shifts")
      .select(`
        id,
        staff_id,
        date,
        start_time,
        end_time,
        notes,
        is_recurring,
        recurring_pattern,
        provider_staff:staff_id(id, name:users(full_name))
      `)
      .eq("provider_id", providerId)
      .order("date", { ascending: true });

    let weekDates: string[] = [];
    if (weekStart) {
      const mondayStartUtc = new Date(dateRangeBoundsUtc(weekStart, weekStart, tz).fromIso);
      weekDates = Array.from({ length: 7 }, (_, index) =>
        formatDateYmd(addDays(mondayStartUtc, index), tz),
      );
      // Include one-off rows in the week and recurring anchors that started
      // before this week ends; expand/filter in application code below.
      shiftQuery = shiftQuery.lte("date", weekDates[6] ?? weekStart);
    }

    if (staffId) {
      shiftQuery = shiftQuery.eq("staff_id", staffId);
    }

    let scheduleQuery = supabase
      .from("staff_schedules")
      .select("staff_id, day_of_week, start_time, end_time, is_working")
      .eq("provider_id", providerId)
      .eq("is_working", true);

    if (staffId) {
      scheduleQuery = scheduleQuery.eq("staff_id", staffId);
    }

    const [{ data: shifts, error: shiftErr }, { data: schedules, error: schedErr }] =
      await Promise.all([shiftQuery, scheduleQuery]);

    if (shiftErr) throw shiftErr;
    if (schedErr) throw schedErr;

    const transformedShifts = (shifts || []).flatMap((shift: any) => {
      const dates = weekDates.length > 0 ? weekDates : [shift.date];
      return dates
        .filter((dateStr) => shiftAppliesOnDate(shift, dateStr, tz))
        .map((dateStr) => ({
          id: shift.id,
          team_member_id: shift.staff_id,
          team_member_name: shift.provider_staff?.name?.full_name || "Staff",
          date: dateStr,
          start_time: shift.start_time.substring(0, 5),
          end_time: shift.end_time.substring(0, 5),
          notes: shift.notes,
          is_recurring: shift.is_recurring,
          recurring_pattern: shift.recurring_pattern,
          source: "shift" as const,
          is_synthetic: false,
        }));
    });

    const shiftDateKeys = new Set(
      transformedShifts.map((s: any) => `${s.team_member_id}::${s.date}`)
    );

    // Build schedule entries from staff_schedules + location hours fallback
    const scheduleEntries: any[] = [];
    if (weekStart) {
      const DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

      // Load location operating hours for fallback
      const { data: locations } = await supabase
        .from("provider_locations")
        .select("working_hours")
        .eq("provider_id", providerId)
        .eq("is_active", true)
        .order("is_primary", { ascending: false })
        .limit(1);

      const locationHours = (locations?.[0]?.working_hours as Record<string, any> | null) ?? null;

      // Collect which staff IDs we know about
      const allStaffIds = new Set<string>();
      transformedShifts.forEach((s: any) => allStaffIds.add(s.team_member_id));
      (schedules || []).forEach((s: any) => allStaffIds.add(s.staff_id));

      // If filtering by staff, only include that staff
      if (staffId) {
        allStaffIds.clear();
        allStaffIds.add(staffId);
      } else {
        // Also load all active staff for the provider
        const { data: allStaff } = await supabase
          .from("provider_staff")
          .select("id")
          .eq("provider_id", providerId)
          .eq("is_active", true);
        (allStaff || []).forEach((s: any) => allStaffIds.add(s.id));
      }

      const schedulesArr = schedules || [];
      const scheduleByStaffDay = new Map<string, any>();
      for (const sched of schedulesArr) {
        scheduleByStaffDay.set(`${sched.staff_id}::${sched.day_of_week}`, sched);
      }

      for (let i = 0; i < 7; i++) {
        const dateStr = weekDates[i]!;
        const dow = getDayInTz(utcStartOfYmd(dateStr, tz), tz);
        const dayKey = DAY_KEYS[dow];

        for (const sid of allStaffIds) {
          const key = `${sid}::${dateStr}`;
          if (shiftDateKeys.has(key)) continue;

          const sched = scheduleByStaffDay.get(`${sid}::${dow}`);
          if (sched) {
            scheduleEntries.push({
              id: `schedule-${sid}-${dow}`,
              team_member_id: sid,
              team_member_name: "",
              date: dateStr,
              start_time: sched.start_time.substring(0, 5),
              end_time: sched.end_time.substring(0, 5),
              notes: null,
              is_recurring: false,
              recurring_pattern: null,
              source: "schedule" as const,
              is_synthetic: true,
            });
          } else if (locationHours) {
            // Fallback: generate shift from location operating hours, accepting
            // both Format A ({ is_open, open_time, close_time }) and Format B
            // ({ open, close, closed }) saved shapes.
            const resolved = resolveLocationHoursDay(locationHours[dayKey ?? ""]);
            if (resolved) {
              scheduleEntries.push({
                id: `location-${sid}-${dow}`,
                team_member_id: sid,
                team_member_name: "",
                date: dateStr,
                start_time: resolved.start_time,
                end_time: resolved.end_time,
                notes: null,
                is_recurring: false,
                recurring_pattern: null,
                source: "location" as const,
                is_synthetic: true,
              });
            }
          }
        }
      }
    }

    return successResponse([...transformedShifts, ...scheduleEntries]);
  } catch (error) {
    return handleApiError(error, "Failed to fetch shifts");
  }
}

/**
 * POST /api/provider/shifts
 * 
 * Create a new shift
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff", "superadmin"], request);

    const supabase = await getSupabaseServer(request);
    const body = await request.json();

    // Validate input
    const validationResult = createShiftSchema.safeParse(body);
    if (!validationResult.success) {
      return errorResponse(
        "Validation failed",
        "VALIDATION_ERROR",
        400,
        validationResult.error.issues
      );
    }

    const { staff_id, date, start_time, end_time, notes, is_recurring, recurring_pattern } = validationResult.data;

    // Get provider ID
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    // Verify staff belongs to provider
    const { data: staff } = await supabase
      .from("provider_staff")
      .select("id")
      .eq("id", staff_id)
      .eq("provider_id", providerId)
      .single();

    if (!staff) {
      return notFoundResponse("Staff member not found");
    }

    // Create shift
    const { data: newShift, error: insertError } = await (supabase
      .from("staff_shifts") as any)
      .insert({
        provider_id: providerId,
        staff_id,
        date,
        start_time,
        end_time,
        notes,
        is_recurring: is_recurring || false,
        recurring_pattern,
      })
      .select(`
        id,
        staff_id,
        date,
        start_time,
        end_time,
        notes,
        is_recurring,
        recurring_pattern
      `)
      .single();

    if (insertError || !newShift) {
      throw insertError || new Error("Failed to create shift");
    }

    // Transform response
    const transformedShift = {
      id: newShift.id,
      team_member_id: newShift.staff_id,
      date: newShift.date,
      start_time: newShift.start_time.substring(0, 5),
      end_time: newShift.end_time.substring(0, 5),
      notes: newShift.notes,
      is_recurring: newShift.is_recurring,
      recurring_pattern: newShift.recurring_pattern,
    };

    return successResponse(transformedShift);
  } catch (error) {
    return handleApiError(error, "Failed to create shift");
  }
}
