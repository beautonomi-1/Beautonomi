import { NextRequest } from "next/server";
import { requireRoleInApi, successResponse, handleApiError, getProviderIdForUser } from "@/lib/supabase/api-helpers";
import { canAccessReport } from "@/lib/subscriptions/report-gating";
import { createClient } from "@supabase/supabase-js";
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { getProviderRevenue } from "@/lib/reports/revenue-helpers";

export async function GET(request: NextRequest) {
  try {
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);

    // Check subscription allows basic reports
    const accessCheck = await canAccessReport(user.id, "basic");
    if (!accessCheck.allowed) {
      return accessCheck.error!;
    }

    const providerId = user.role === 'superadmin'
      ? request.nextUrl.searchParams.get('provider_id')
      : await getProviderIdForUser(user.id, supabaseAdmin);
    if (!providerId) {
      return handleApiError(
        new Error('Provider profile not found'),
        'NOT_FOUND',
        404
      );
    }

    const now = new Date();

    // Today's metrics
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);

    // This week's metrics
    const weekStart = startOfWeek(now);
    const weekEnd = endOfWeek(now);

    // This month's metrics
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);

    // Get provider revenue from finance_transactions for different periods
    const { totalRevenue: todayRevenue } = await getProviderRevenue(
      supabaseAdmin,
      providerId,
      startOfToday,
      endOfToday
    );

    const { totalRevenue: weekRevenue } = await getProviderRevenue(
      supabaseAdmin,
      providerId,
      weekStart,
      weekEnd
    );

    const { totalRevenue: monthRevenue } = await getProviderRevenue(
      supabaseAdmin,
      providerId,
      monthStart,
      monthEnd
    );

    // Get bookings for different periods (for counts and status)
    const { data: todayBookings } = await supabaseAdmin
      .from("bookings")
      .select("id, status, scheduled_at")
      .eq("provider_id", providerId)
      .gte("scheduled_at", startOfToday.toISOString())
      .lte("scheduled_at", endOfToday.toISOString());

    const { data: weekBookings } = await supabaseAdmin
      .from("bookings")
      .select("id, status, scheduled_at")
      .eq("provider_id", providerId)
      .gte("scheduled_at", weekStart.toISOString())
      .lte("scheduled_at", weekEnd.toISOString());

    const { data: monthBookings } = await supabaseAdmin
      .from("bookings")
      .select("id, status, scheduled_at, customer_id")
      .eq("provider_id", providerId)
      .gte("scheduled_at", monthStart.toISOString())
      .lte("scheduled_at", monthEnd.toISOString());

    // Calculate today's metrics
    const todayBookingsCount = todayBookings?.length || 0;
    const todayCompleted = todayBookings?.filter((b) => b.status === "completed").length || 0;

    // Calculate week's metrics
    const weekBookingsCount = weekBookings?.length || 0;

    // Calculate month's metrics
    const monthBookingsCount = monthBookings?.length || 0;
    const monthClients = new Set(monthBookings?.map((b) => b.customer_id).filter(Boolean)).size;

    // Get upcoming bookings
    const { data: upcomingBookings } = await supabaseAdmin
      .from("bookings")
      .select("id, scheduled_at, status")
      .eq("provider_id", providerId)
      .gte("scheduled_at", now.toISOString())
      .order("scheduled_at", { ascending: true })
      .limit(10);

    // Get recent bookings
    const { data: recentBookings } = await supabaseAdmin
      .from("bookings")
      .select("id, scheduled_at, status")
      .eq("provider_id", providerId)
      .lte("scheduled_at", now.toISOString())
      .order("scheduled_at", { ascending: false })
      .limit(10);

    return successResponse({
      today: {
        revenue: todayRevenue,
        bookings: todayBookingsCount,
        completed: todayCompleted,
      },
      week: {
        revenue: weekRevenue,
        bookings: weekBookingsCount,
      },
      month: {
        revenue: monthRevenue,
        bookings: monthBookingsCount,
        clients: monthClients,
      },
      upcomingBookings: upcomingBookings || [],
      recentBookings: recentBookings || [],
    });
  } catch (error) {
    return handleApiError(error, "BUSINESS_DASHBOARD_ERROR", 500);
  }
}
