import { NextRequest } from "next/server";
import {  requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError  } from "@/lib/supabase/api-helpers";
import { createClient } from "@supabase/supabase-js";
import { subDays, format, eachDayOfInterval } from "date-fns";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff", "superadmin"], request);

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const providerId = await getProviderIdForUser(user.id, supabaseAdmin);
    if (!providerId) return notFoundResponse("Provider not found");
    const endDate = new Date();
    const startDate = subDays(endDate, 6);

    const { data: bookingServiceIds } = await supabaseAdmin
      .from("booking_services")
      .select("booking_id")
      .eq("staff_id", params.id);

    const bookingIds = [...new Set((bookingServiceIds || []).map((bs: any) => bs.booking_id))];

    const days = eachDayOfInterval({ start: startDate, end: endDate });
    const dayMap = new Map<string, number>();
    days.forEach((d) => dayMap.set(format(d, "yyyy-MM-dd"), 0));

    if (bookingIds.length > 0) {
      const { data: bookings } = await supabaseAdmin
        .from("bookings")
        .select("scheduled_at")
        .eq("provider_id", providerId)
        .in("id", bookingIds)
        .gte("scheduled_at", startDate.toISOString())
        .lte("scheduled_at", new Date(endDate.getTime() + 86400000).toISOString())
        .not("status", "in", "(cancelled,no_show)");

      (bookings || []).forEach((b: any) => {
        const day = format(new Date(b.scheduled_at), "yyyy-MM-dd");
        dayMap.set(day, (dayMap.get(day) ?? 0) + 1);
      });
    }

    const result = days.map((d) => ({
      day: format(d, "yyyy-MM-dd"),
      count: dayMap.get(format(d, "yyyy-MM-dd")) ?? 0,
    }));

    return successResponse(result);
  } catch (error) {
    return handleApiError(error, "Failed to load staff weekly stats");
  }
}
