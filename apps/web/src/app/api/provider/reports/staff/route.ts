import { NextRequest } from "next/server";
import {  requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError  } from "@/lib/supabase/api-helpers";
import { createClient } from "@supabase/supabase-js";
import { subDays } from "date-fns";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff", "superadmin"], request);

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const providerId = await getProviderIdForUser(user.id, supabaseAdmin);
    if (!providerId) return notFoundResponse("Provider not found");
    const sp = request.nextUrl.searchParams;
    const fromDate = sp.get("from") ? new Date(sp.get("from")!) : subDays(new Date(), 30);
    const toDate = sp.get("to") ? new Date(sp.get("to")!) : new Date();

    const { data: staffMembers } = await supabaseAdmin
      .from("provider_staff")
      .select("id, user_id, users(full_name)")
      .eq("provider_id", providerId)
      .eq("is_active", true);

    const { data: bookingServices } = await supabaseAdmin
      .from("booking_services")
      .select("staff_id, price, bookings!inner(id, provider_id, status, scheduled_at)")
      .eq("bookings.provider_id", providerId)
      .gte("bookings.scheduled_at", fromDate.toISOString())
      .lte("bookings.scheduled_at", new Date(toDate.getTime() + 86400000).toISOString())
      .not("bookings.status", "in", "(cancelled,no_show)");

    const staffMap = new Map<string, { name: string; bookings: number; revenue: number; completed: number }>();

    (staffMembers || []).forEach((s: any) => {
      const name = s.users?.full_name || "Staff";
      staffMap.set(s.id, { name, bookings: 0, revenue: 0, completed: 0 });
    });

    (bookingServices || []).forEach((bs: any) => {
      if (!bs.staff_id) return;
      const existing = staffMap.get(bs.staff_id) || { name: "Unassigned", bookings: 0, revenue: 0, completed: 0 };
      existing.bookings += 1;
      existing.revenue += Number(bs.price || 0);
      if ((bs.bookings as any)?.status === "completed") existing.completed += 1;
      staffMap.set(bs.staff_id, existing);
    });

    const staff = Array.from(staffMap.values())
      .map((s) => ({
        name: s.name,
        bookings: s.bookings,
        revenue: s.revenue,
        rating: 0,
        hours_worked: 0,
        commission: 0,
        completion_rate: s.bookings > 0 ? (s.completed / s.bookings) * 100 : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    return successResponse({
      staff,
      total_hours: 0,
      total_commission: 0,
    });
  } catch (error) {
    console.error("Error in staff report:", error);
    return handleApiError(error, "Failed to generate staff report");
  }
}
