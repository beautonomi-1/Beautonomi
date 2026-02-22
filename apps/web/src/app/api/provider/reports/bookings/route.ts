import { NextRequest } from "next/server";
import { requireRoleInApi, getProviderIdForUser, notFoundResponse, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { createClient } from "@supabase/supabase-js";
import { subDays, getDay } from "date-fns";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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

    const fromDate = sp.get("from") ? new Date(sp.get("from")!) : subDays(new Date(), 30);
    const toDate = sp.get("to") ? new Date(sp.get("to")!) : new Date();

    const { data: bookings } = await supabaseAdmin
      .from("bookings")
      .select("id, status, scheduled_at, cancellation_reason")
      .eq("provider_id", providerId)
      .gte("scheduled_at", fromDate.toISOString())
      .lte("scheduled_at", new Date(toDate.getTime() + 86400000).toISOString());

    const all = bookings || [];
    const total = all.length;

    const statusCounts = new Map<string, number>();
    const dayOfWeekCounts = new Map<string, number>();
    const cancelReasons = new Map<string, number>();
    let completedCount = 0;
    let cancelledCount = 0;
    let noShowCount = 0;

    DAY_NAMES.forEach((d) => dayOfWeekCounts.set(d, 0));

    all.forEach((b: any) => {
      statusCounts.set(b.status, (statusCounts.get(b.status) ?? 0) + 1);
      const dayName = DAY_NAMES[getDay(new Date(b.scheduled_at))] ?? "Mon";
      dayOfWeekCounts.set(dayName, (dayOfWeekCounts.get(dayName) ?? 0) + 1);

      if (b.status === "completed") completedCount++;
      else if (b.status === "cancelled") {
        cancelledCount++;
        if (b.cancellation_reason) {
          cancelReasons.set(b.cancellation_reason, (cancelReasons.get(b.cancellation_reason) ?? 0) + 1);
        }
      } else if (b.status === "no_show") noShowCount++;
    });

    const daysDiff = Math.max(1, Math.ceil((toDate.getTime() - fromDate.getTime()) / 86400000));

    return successResponse({
      total_bookings: total,
      by_status: Array.from(statusCounts.entries()).map(([status, count]) => ({ status, count })),
      by_day_of_week: DAY_NAMES.map((day) => ({ day, count: dayOfWeekCounts.get(day) ?? 0 })),
      completion_rate: total > 0 ? (completedCount / total) * 100 : 0,
      cancellation_count: cancelledCount,
      no_show_count: noShowCount,
      avg_per_day: total / daysDiff,
      cancellation_reasons: Array.from(cancelReasons.entries())
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count),
    });
  } catch (error) {
    console.error("Error in bookings report:", error);
    return handleApiError(error, "Failed to generate bookings report");
  }
}
