import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError, getProviderIdForUser, notFoundResponse, errorResponse } from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { resolveProviderStaffRowId } from "@/lib/provider/resolve-provider-staff-id";
import { getProviderStaffIdForUser } from "@/lib/auth/provider-team-roster-access";
import {
  findFutureBookingsForStaff,
  futureBookingsConflictResponse,
} from "@/lib/provider/find-future-bookings-for-staff";
import { notifyStaffUser } from "@/lib/notifications/notify-staff-event";
import { z } from "zod";

const DAY_ORDER = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/**
 * GET /api/provider/staff/[id]/shifts
 * Returns weekly schedule for a staff member from staff_schedules table.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff", "superadmin"], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    const resolvedStaffId = await resolveProviderStaffRowId(supabase, providerId, id);
    if (!resolvedStaffId) return notFoundResponse("Staff member not found");

    const { data: schedules } = await supabase
      .from("staff_schedules")
      .select("id, day_of_week, start_time, end_time, is_working")
      .eq("staff_id", resolvedStaffId)
      .order("day_of_week");

    const scheduleMap = new Map((schedules || []).map((s: any) => [s.day_of_week, s]));

    const result = DAY_ORDER.map((day, index) => {
      const schedule = scheduleMap.get(index);
      return {
        id: schedule?.id || null,
        staff_id: resolvedStaffId,
        day_of_week: day.charAt(0).toUpperCase() + day.slice(1),
        start_time: schedule?.start_time?.substring(0, 5) || null,
        end_time: schedule?.end_time?.substring(0, 5) || null,
        is_working: schedule?.is_working ?? false,
      };
    });

    return successResponse(result);
  } catch (error) {
    return handleApiError(error, "Failed to load staff schedule");
  }
}

const upsertScheduleSchema = z.object({
  day_of_week: z.string(),
  start_time: z.string().regex(/^\d{2}:\d{2}$/),
  end_time: z.string().regex(/^\d{2}:\d{2}$/),
  notes: z.string().nullable().optional(),
  /** Proceed even when future bookings fall outside the new hours. */
  force: z.boolean().optional(),
});

/**
 * Owner / manage_team may edit anyone; a staff member may edit their own hours.
 */
async function canEditStaffSchedule(
  supabase: Awaited<ReturnType<typeof getSupabaseServer>>,
  request: NextRequest,
  user: { id: string; role?: string },
  providerId: string,
  staffId: string,
): Promise<boolean> {
  if (user.role === "superadmin") return true;
  const manage = await requirePermission("manage_team", request);
  if (manage.authorized) return true;
  const ownStaffId = await getProviderStaffIdForUser(user.id, providerId, supabase);
  return ownStaffId === staffId;
}

async function providerTimezone(
  supabase: Awaited<ReturnType<typeof getSupabaseServer>>,
  providerId: string,
): Promise<string | undefined> {
  const { data } = await supabase.from("providers").select("timezone").eq("id", providerId).maybeSingle();
  return (data as { timezone?: string | null } | null)?.timezone ?? undefined;
}

/**
 * POST /api/provider/staff/[id]/shifts
 * Create or update a weekly schedule entry for a staff member.
 * Returns 409 FUTURE_BOOKINGS_CONFLICT (with the list) when existing future
 * bookings on that weekday fall outside the new hours, unless `force: true`.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff", "superadmin"], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    const resolvedStaffId = await resolveProviderStaffRowId(supabase, providerId, id);
    if (!resolvedStaffId) return notFoundResponse("Staff member not found");

    if (!(await canEditStaffSchedule(supabase, request, user, providerId, resolvedStaffId))) {
      return errorResponse("You can only edit your own schedule.", "FORBIDDEN", 403);
    }

    const body = await request.json();
    const result = upsertScheduleSchema.safeParse(body);
    if (!result.success) {
      return errorResponse("Validation failed", "VALIDATION_ERROR", 400, result.error.issues);
    }

    const dayIndex = DAY_ORDER.indexOf(result.data.day_of_week.toLowerCase());
    if (dayIndex === -1) {
      return errorResponse("Invalid day_of_week", "VALIDATION_ERROR", 400);
    }

    if (result.data.force !== true) {
      const conflicts = await findFutureBookingsForStaff(supabase, providerId, resolvedStaffId, {
        outsideHours: {
          days: [
            {
              day_of_week: dayIndex,
              start_time: result.data.start_time,
              end_time: result.data.end_time,
              is_working: true,
            },
          ],
          timezone: await providerTimezone(supabase, providerId),
        },
      });
      if (conflicts.length > 0) {
        const payload = futureBookingsConflictResponse(conflicts);
        return errorResponse(
          `${conflicts.length} future booking(s) fall outside the new hours. Reschedule them or pass force to proceed.`,
          "FUTURE_BOOKINGS_CONFLICT",
          409,
          payload,
        );
      }
    }

    const { data: schedule, error } = await supabase
      .from("staff_schedules")
      .upsert({
        staff_id: resolvedStaffId,
        provider_id: providerId,
        day_of_week: dayIndex,
        start_time: result.data.start_time,
        end_time: result.data.end_time,
        is_working: true,
      }, { onConflict: "staff_id,day_of_week" })
      .select()
      .single();

    if (error) throw error;

    const ownStaffId = await getProviderStaffIdForUser(user.id, providerId, supabase);
    if (ownStaffId !== resolvedStaffId) {
      const dayLabel = result.data.day_of_week.charAt(0).toUpperCase() + result.data.day_of_week.slice(1).toLowerCase();
      void notifyStaffUser(resolvedStaffId, "staff_schedule_changed", {
        title: "Your schedule changed",
        message: `Your working hours for ${dayLabel} are now ${result.data.start_time}–${result.data.end_time}.`,
        url: "/provider/staff/schedule",
        metadata: { day_of_week: dayIndex, start_time: result.data.start_time, end_time: result.data.end_time },
      }).catch(() => undefined);
    }

    return successResponse({
      id: schedule.id,
      staff_id: resolvedStaffId,
      day_of_week: result.data.day_of_week,
      start_time: schedule.start_time?.substring(0, 5),
      end_time: schedule.end_time?.substring(0, 5),
    }, 201);
  } catch (error) {
    return handleApiError(error, "Failed to save staff schedule");
  }
}
