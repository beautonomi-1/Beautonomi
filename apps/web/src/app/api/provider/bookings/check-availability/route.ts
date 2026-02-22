import { NextRequest } from "next/server";
import { requireRoleInApi, getProviderIdForUser, notFoundResponse, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { createClient } from "@supabase/supabase-js";
import { addMinutes } from "date-fns";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff", "superadmin"], request);

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );    const sp = request.nextUrl.searchParams;
    const providerId = await getProviderIdForUser(user.id, supabaseAdmin);
    if (!providerId) return notFoundResponse("Provider not found");

    const scheduledAt = sp.get("scheduled_at");
    const durationMinutes = parseInt(sp.get("duration_minutes") || "60", 10);
    const staffIdsParam = sp.get("staff_ids");
    const locationId = sp.get("location_id");

    if (!scheduledAt) {
      return handleApiError(new Error("scheduled_at is required"), "VALIDATION_ERROR", 400);
    }

    const startTime = new Date(scheduledAt);
    const endTime = addMinutes(startTime, durationMinutes);

    let query = supabaseAdmin
      .from("bookings")
      .select("id, booking_number, scheduled_at, booking_services(duration_minutes, staff_id)")
      .eq("provider_id", providerId)
      .not("status", "in", "(cancelled,no_show)")
      .gte("scheduled_at", new Date(startTime.getTime() - durationMinutes * 60000).toISOString())
      .lte("scheduled_at", endTime.toISOString());

    if (locationId) {
      query = query.eq("location_id", locationId);
    }

    const { data: overlapping } = await query;

    const conflicts: string[] = [];
    const staffIds = staffIdsParam ? staffIdsParam.split(",") : [];

    (overlapping || []).forEach((b: any) => {
      const bStart = new Date(b.scheduled_at);
      const bDuration = (b.booking_services || []).reduce((s: number, bs: any) => s + (bs.duration_minutes || 30), 0);
      const bEnd = addMinutes(bStart, bDuration);

      if (startTime < bEnd && endTime > bStart) {
        if (staffIds.length > 0) {
          const bookingStaffIds = (b.booking_services || []).map((bs: any) => bs.staff_id).filter(Boolean);
          const hasConflict = staffIds.some((sid) => bookingStaffIds.includes(sid));
          if (hasConflict) {
            conflicts.push(`Conflict with booking #${b.booking_number}`);
          }
        } else {
          conflicts.push(`Conflict with booking #${b.booking_number}`);
        }
      }
    });

    return successResponse({
      available: conflicts.length === 0,
      conflicts,
    });
  } catch (error) {
    return handleApiError(error, "Failed to check availability");
  }
}
