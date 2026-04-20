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

    // §Provider-audit 2026-04 (round 8): pull staff-specific review ratings
    // for the same window. Prior output hard-coded `rating: 0` for every
    // staff member, which rendered a "Ratings" section in the mobile
    // report showing 0.0 stars for the entire team — deeply misleading.
    const { data: reviews } = await supabaseAdmin
      .from("reviews")
      .select("staff_rating, rating, created_at")
      .eq("provider_id", providerId)
      .gte("created_at", fromDate.toISOString())
      .lte("created_at", toDate.toISOString());

    const staffMap = new Map<
      string,
      {
        id: string;
        name: string;
        bookingIds: Set<string>;
        completedBookingIds: Set<string>;
        revenue: number;
        ratingSum: number;
        ratingCount: number;
      }
    >();

    (staffMembers || []).forEach((s: any) => {
      const name = s.users?.full_name || "Staff";
      staffMap.set(s.id, {
        id: s.id,
        name,
        bookingIds: new Set(),
        completedBookingIds: new Set(),
        revenue: 0,
        ratingSum: 0,
        ratingCount: 0,
      });
    });

    (bookingServices || []).forEach((bs: any) => {
      if (!bs.staff_id) return;
      const bRow = Array.isArray(bs.bookings) ? bs.bookings[0] : bs.bookings;
      const bookingId = bRow?.id as string | undefined;
      if (!bookingId) return;
      const existing = staffMap.get(bs.staff_id) || {
        id: bs.staff_id,
        name: "Unassigned",
        bookingIds: new Set<string>(),
        completedBookingIds: new Set<string>(),
        revenue: 0,
        ratingSum: 0,
        ratingCount: 0,
      };
      existing.bookingIds.add(bookingId);
      existing.revenue += Number(bs.price || 0);
      if (bRow?.status === "completed") existing.completedBookingIds.add(bookingId);
      staffMap.set(bs.staff_id, existing);
    });

    // `reviews.staff_rating` is JSONB shaped { staff_id, rating } or null.
    (reviews || []).forEach((r: any) => {
      const sr = r?.staff_rating;
      if (!sr || typeof sr !== "object") return;
      const sid = sr.staff_id as string | undefined;
      const rating = Number(sr.rating ?? r?.rating ?? 0);
      if (!sid || !Number.isFinite(rating) || rating <= 0) return;
      const entry = staffMap.get(sid);
      if (!entry) return;
      entry.ratingSum += rating;
      entry.ratingCount += 1;
    });

    const staff = Array.from(staffMap.values())
      .map((s) => ({
        id: s.id,
        name: s.name,
        bookings: s.bookingIds.size,
        revenue: s.revenue,
        rating: s.ratingCount > 0 ? s.ratingSum / s.ratingCount : 0,
        review_count: s.ratingCount,
        completion_rate:
          s.bookingIds.size > 0 ? (s.completedBookingIds.size / s.bookingIds.size) * 100 : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    // §Provider-audit 2026-04 (round 8): stopped returning zero-valued
    // `hours_worked` / `commission` / `total_hours` / `total_commission`
    // placeholders — the mobile UI surfaces them as real metrics when they
    // are non-null, so returning a constant 0 looked like "everyone worked
    // 0 hours". Callers that need per-service-time or commission breakdowns
    // should use /api/provider/reports/staff/performance instead.
    return successResponse({ staff });
  } catch (error) {
    console.error("Error in staff report:", error);
    return handleApiError(error, "Failed to generate staff report");
  }
}
