import { NextRequest } from "next/server";
import {
  requireRoleInApi,
  getProviderIdForUser,
  successResponse,
  notFoundResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { createClient } from "@supabase/supabase-js";
import { getProviderReportContext, reportDateRangeFromParams } from "@/lib/reports/provider-report-utils";
import { getProviderRevenue } from "@/lib/reports/revenue-helpers";
import { LEDGER_FULL_PROVIDER_NET_TYPES } from "@/lib/reports/constants";
import { allocateLedgerNetByStaff } from "@/lib/reports/staff-ledger-revenue";

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
    const reportContext = await getProviderReportContext(supabaseAdmin, providerId);
    const sp = request.nextUrl.searchParams;
    const locationId = sp.get("location_id") || null;
    const { fromDate, toDate } = reportDateRangeFromParams(sp, reportContext.timezone, { defaultDays: 30 });

    const { data: staffMembers } = await supabaseAdmin
      .from("provider_staff")
      .select("id, user_id, users(full_name)")
      .eq("provider_id", providerId)
      .eq("is_active", true);

    let bookingsQuery = supabaseAdmin
      .from("bookings")
      .select(
        `
        id,
        status,
        scheduled_at,
        booking_services (
          staff_id,
          price
        )
      `,
      )
      .eq("provider_id", providerId)
      .gte("scheduled_at", fromDate.toISOString())
      .lte("scheduled_at", toDate.toISOString())
      .not("status", "in", "(cancelled,no_show)");

    if (locationId) {
      bookingsQuery = bookingsQuery.eq("location_id", locationId);
    }

    const { data: bookings, error: bookingsError } = await bookingsQuery;

    if (bookingsError) {
      return handleApiError(bookingsError, "BOOKINGS_FETCH_ERROR", 500);
    }

    const { revenueByBooking } = await getProviderRevenue(
      supabaseAdmin,
      providerId,
      fromDate,
      toDate,
      locationId,
      {
        transactionTypes: LEDGER_FULL_PROVIDER_NET_TYPES,
        timezone: reportContext.timezone,
      },
    );

    const ledgerByStaff = allocateLedgerNetByStaff(revenueByBooking, bookings || []);

    const { data: reviews } = await supabaseAdmin
      .from("reviews")
      .select("staff_rating, rating, created_at")
      .eq("provider_id", providerId)
      .gte("created_at", fromDate.toISOString())
      .lte("created_at", toDate.toISOString());

    const bookingIdsPerStaff = new Map<string, Set<string>>();
    const completedIdsPerStaff = new Map<string, Set<string>>();

    for (const b of bookings || []) {
      const bid = b.id as string;
      const st = (b as { status?: string }).status;
      const lines = (b as { booking_services?: Array<{ staff_id?: string | null }> }).booking_services;
      if (!lines?.length) continue;
      const staffOnBooking = new Set<string>();
      for (const line of lines) {
        if (line.staff_id) staffOnBooking.add(line.staff_id);
      }
      for (const sid of staffOnBooking) {
        let set = bookingIdsPerStaff.get(sid);
        if (!set) {
          set = new Set();
          bookingIdsPerStaff.set(sid, set);
        }
        set.add(bid);
        if (st === "completed") {
          let cs = completedIdsPerStaff.get(sid);
          if (!cs) {
            cs = new Set();
            completedIdsPerStaff.set(sid, cs);
          }
          cs.add(bid);
        }
      }
    }

    const ratingByStaff = new Map<string, { sum: number; count: number }>();
    for (const r of reviews || []) {
      const sr = (r as { staff_rating?: { staff_id?: string; rating?: number }; rating?: number }).staff_rating;
      if (!sr || typeof sr !== "object") continue;
      const sid = sr.staff_id as string | undefined;
      const rating = Number(sr.rating ?? (r as { rating?: number }).rating ?? 0);
      if (!sid || !Number.isFinite(rating) || rating <= 0) continue;
      const row = ratingByStaff.get(sid) || { sum: 0, count: 0 };
      row.sum += rating;
      row.count += 1;
      ratingByStaff.set(sid, row);
    }

    const staff = (staffMembers || []).map((s: { id: string; users?: { full_name?: string } | { full_name?: string }[] }) => {
      const sid = s.id;
      const u = s.users;
      const fullName = Array.isArray(u) ? u[0]?.full_name : u?.full_name;
      const bookingsCount = bookingIdsPerStaff.get(sid)?.size ?? 0;
      const completedCount = completedIdsPerStaff.get(sid)?.size ?? 0;
      const rr = ratingByStaff.get(sid);
      return {
        id: sid,
        name: fullName || "Staff",
        bookings: bookingsCount,
        revenue: ledgerByStaff.get(sid) ?? 0,
        rating: rr && rr.count > 0 ? rr.sum / rr.count : 0,
        review_count: rr?.count ?? 0,
        completion_rate: bookingsCount > 0 ? (completedCount / bookingsCount) * 100 : 0,
      };
    });

    staff.sort((a, b) => b.revenue - a.revenue);

    const uniqueBookings = new Set((bookings || []).map((b) => b.id)).size;
    const totalLedgerNet = staff.reduce((sum, x) => sum + x.revenue, 0);

    return successResponse({
      staff,
      summary: {
        uniqueBookings,
        totalLedgerNet,
        staffWithActivity: staff.filter((x) => x.bookings > 0 || x.revenue > 0).length,
      },
      ledgerTransactionTypes: [...LEDGER_FULL_PROVIDER_NET_TYPES],
      basisNote:
        "Revenue is ledger net (provider earnings, travel fees, tips) allocated by each line’s share of the booking subtotal — same basis as Sales Summary. Visits exclude cancelled and no-show. Reviews match staff_rating in the date window.",
    });
  } catch (error) {
    console.error("Error in staff report:", error);
    return handleApiError(error, "Failed to generate staff report");
  }
}
