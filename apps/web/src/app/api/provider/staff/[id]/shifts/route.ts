import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError, getProviderIdForUser, notFoundResponse, errorResponse } from "@/lib/supabase/api-helpers";
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

    const { data: staff } = await supabase
      .from("provider_staff")
      .select("id")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (!staff) return notFoundResponse("Staff member not found");

    const { data: schedules } = await supabase
      .from("staff_schedules")
      .select("id, day_of_week, start_time, end_time, is_working")
      .eq("staff_id", id)
      .order("day_of_week");

    const scheduleMap = new Map((schedules || []).map((s: any) => [s.day_of_week, s]));

    const result = DAY_ORDER.map((day, index) => {
      const schedule = scheduleMap.get(index);
      return {
        id: schedule?.id || null,
        staff_id: id,
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
});

/**
 * POST /api/provider/staff/[id]/shifts
 * Create or update a weekly schedule entry for a staff member.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff", "superadmin"], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    const { data: staff } = await supabase
      .from("provider_staff")
      .select("id")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (!staff) return notFoundResponse("Staff member not found");

    const body = await request.json();
    const result = upsertScheduleSchema.safeParse(body);
    if (!result.success) {
      return errorResponse("Validation failed", "VALIDATION_ERROR", 400, result.error.issues);
    }

    const dayIndex = DAY_ORDER.indexOf(result.data.day_of_week.toLowerCase());
    if (dayIndex === -1) {
      return errorResponse("Invalid day_of_week", "VALIDATION_ERROR", 400);
    }

    const { data: schedule, error } = await supabase
      .from("staff_schedules")
      .upsert({
        staff_id: id,
        provider_id: providerId,
        day_of_week: dayIndex,
        start_time: result.data.start_time,
        end_time: result.data.end_time,
        is_working: true,
      }, { onConflict: "staff_id,day_of_week" })
      .select()
      .single();

    if (error) throw error;

    return successResponse({
      id: schedule.id,
      staff_id: id,
      day_of_week: result.data.day_of_week,
      start_time: schedule.start_time?.substring(0, 5),
      end_time: schedule.end_time?.substring(0, 5),
    }, 201);
  } catch (error) {
    return handleApiError(error, "Failed to save staff schedule");
  }
}
