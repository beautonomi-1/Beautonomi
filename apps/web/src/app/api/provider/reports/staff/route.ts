import { NextRequest } from "next/server";
import {  requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError  } from "@/lib/supabase/api-helpers";
import { createClient } from "@supabase/supabase-js";
import { subDays, startOfDay, endOfDay } from "date-fns";

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
    const locationId = sp.get("location_id") || null;
    const fromDate = sp.get("from") ? startOfDay(new Date(sp.get("from")!)) : startOfDay(subDays(new Date(), 30));
    const toDate = sp.get("to") ? endOfDay(new Date(sp.get("to")!)) : endOfDay(new Date());

    const { data: staffMembers } = await supabaseAdmin
      .from("provider_staff")
      .select("id, user_id, users(full_name)")
      .eq("provider_id", providerId)
      .eq("is_active", true);

    let bookingServicesQuery = supabaseAdmin
      .from("booking_services")
      .select("staff_id, price, bookings!inner(id, provider_id, status, scheduled_at, location_id)")
      .eq("bookings.provider_id", providerId)
      .gte("bookings.scheduled_at", fromDate.toISOString())
      .lte("bookings.scheduled_at", toDate.toISOString())
      .not("bookings.status", "in", "(cancelled,no_show)");
    if (locationId) bookingServicesQuery = bookingServicesQuery.eq("bookings.location_id", locationId);
    const { data: bookingServices } = await bookingServicesQuery;

    const staffMap = new Map<
      string,
      {
        name: string;
        bookingIds: Set<string>;
        completedBookingIds: Set<string>;
        revenue: number;
      }
    >();

    (staffMembers || []).forEach((s: any) => {
      const name = s.users?.full_name || "Staff";
      staffMap.set(s.id, { name, bookingIds: new Set(), completedBookingIds: new Set(), revenue: 0 });
    });

    (bookingServices || []).forEach((bs: any) => {
      if (!bs.staff_id) return;
      const bRow = Array.isArray(bs.bookings) ? bs.bookings[0] : bs.bookings;
      const bookingId = bRow?.id as string | undefined;
      if (!bookingId) return;
      const existing = staffMap.get(bs.staff_id) || {
        name: "Unassigned",
        bookingIds: new Set<string>(),
        completedBookingIds: new Set<string>(),
        revenue: 0,
      };
      existing.bookingIds.add(bookingId);
      existing.revenue += Number(bs.price || 0);
      if (bRow?.status === "completed") existing.completedBookingIds.add(bookingId);
      staffMap.set(bs.staff_id, existing);
    });

    const staff = Array.from(staffMap.values())
      .map((s) => ({
        name: s.name,
        bookings: s.bookingIds.size,
        revenue: s.revenue,
        rating: 0,
        hours_worked: 0,
        commission: 0,
        completion_rate:
          s.bookingIds.size > 0 ? (s.completedBookingIds.size / s.bookingIds.size) * 100 : 0,
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
