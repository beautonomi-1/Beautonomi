import { NextRequest } from "next/server";
import { requireRoleInApi, successResponse, notFoundResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { createClient } from "@supabase/supabase-js";
import { getProviderRevenue } from "@/lib/reports/revenue-helpers";
import { calculateStaffCommission } from "@/lib/payroll/commission-calculator";
import { getTipsByStaff } from "@/lib/payroll/tips-helper";

export interface StaffTotalsItem {
  team_member_id: string;
  team_member_name: string;
  appointments_count: number;
  revenue: number;
  tips: number;
  hours_worked: number;
  commission: number;
  rating?: number;
}

/**
 * GET /api/provider/staff/[id]/totals
 * Get staff totals for a specific member
 * Query: date (YYYY-MM-DD), period (daily|weekly), start_date, end_date
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff", "superadmin"], request);
    const { id } = await params;

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: providerAsOwner } = await supabaseAdmin
      .from("providers")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    const { data: staffAsUser } = await supabaseAdmin
      .from("provider_staff")
      .select("provider_id")
      .eq("user_id", user.id)
      .maybeSingle();

    const providerId = providerAsOwner?.id ?? staffAsUser?.provider_id;
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const { data: staff } = await supabaseAdmin
      .from("provider_staff")
      .select("id, user_id, users(full_name)")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (!staff) {
      return notFoundResponse("Staff member not found");
    }

    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period") || "daily";
    const dateStr = searchParams.get("date");
    const startDateStr = searchParams.get("start_date");
    const endDateStr = searchParams.get("end_date");

    let fromDate: Date;
    let toDate: Date;

    if (period === "daily" && dateStr) {
      fromDate = new Date(dateStr);
      fromDate.setHours(0, 0, 0, 0);
      toDate = new Date(dateStr);
      toDate.setHours(23, 59, 59, 999);
    } else if (period === "weekly" && startDateStr && endDateStr) {
      fromDate = new Date(startDateStr);
      fromDate.setHours(0, 0, 0, 0);
      toDate = new Date(endDateStr);
      toDate.setHours(23, 59, 59, 999);
    } else {
      const fallback = new Date();
      fromDate = new Date(fallback);
      fromDate.setDate(fallback.getDate() - 7);
      toDate = new Date();
    }

    const commission = await calculateStaffCommission(
      supabaseAdmin,
      providerId,
      id,
      fromDate,
      toDate
    );

    const { revenueByBooking } = await getProviderRevenue(
      supabaseAdmin,
      providerId,
      fromDate,
      toDate
    );

    const { data: bookings } = await supabaseAdmin
      .from("bookings")
      .select("id, status, booking_services(id, staff_id, price)")
      .eq("provider_id", providerId)
      .gte("scheduled_at", fromDate.toISOString())
      .lte("scheduled_at", toDate.toISOString())
      .in("status", ["confirmed", "completed"]);

    let appointmentsCount = 0;
    let revenue = 0;
    for (const b of bookings || []) {
      const services = (b as any).booking_services || [];
      const staffServices = services.filter((s: any) => s.staff_id === id);
      if (staffServices.length === 0) continue;
      appointmentsCount += 1;
      const totalPrice = services.reduce((s: number, x: any) => s + Number(x.price || 0), 0);
      const staffPrice = staffServices.reduce((s: number, x: any) => s + Number(x.price || 0), 0);
      if (totalPrice > 0) {
        revenue += (revenueByBooking.get((b as any).id) || 0) * (staffPrice / totalPrice);
      }
    }

    const { data: timeCards } = await supabaseAdmin
      .from("staff_time_cards")
      .select("total_hours")
      .eq("staff_id", id)
      .gte("date", fromDate.toISOString().split("T")[0])
      .lte("date", toDate.toISOString().split("T")[0])
      .not("total_hours", "is", null);

    const hoursWorked = (timeCards || []).reduce(
      (s: number, tc: any) => s + Number(tc.total_hours || 0),
      0
    );

    const tipsByStaff = await getTipsByStaff(supabaseAdmin, providerId, fromDate, toDate);
    const tips = tipsByStaff.get(id) || 0;

    const item: StaffTotalsItem = {
      team_member_id: id,
      team_member_name: (staff.users as any)?.full_name || "Unknown",
      appointments_count: appointmentsCount,
      revenue,
      tips,
      hours_worked: hoursWorked,
      commission: commission.totalCommission,
      rating: undefined,
    };

    return successResponse([item]);
  } catch (error) {
    return handleApiError(error, "Failed to load staff totals");
  }
}
