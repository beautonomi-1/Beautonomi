import { NextRequest } from "next/server";
import {  requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError  } from "@/lib/supabase/api-helpers";
import { createClient } from "@supabase/supabase-js";
import { getProviderReportContext, reportDateRangeFromParams } from "@/lib/reports/provider-report-utils";

/**
 * Legacy aggregate by catalogue line-item gross (`booking_services.price`).
 * For platform-aligned ledger net by offering, use `GET /api/provider/reports/sales/services`.
 */
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

    // §Provider-audit 2026-04 (round 9): group by `offering_id` instead of
    // the service title. Otherwise any rename split the historical row into
    // two separate entries (or — worse — collapsed two distinct services
    // that happened to share a display name) and every line missing an
    // offering record fell into a single "Unknown Service" bucket.
    let bookingServicesQuery = supabaseAdmin
      .from("booking_services")
      .select(
        "booking_id, offering_id, price, duration_minutes, offerings:offering_id(title), bookings!inner(provider_id, status, scheduled_at, location_id)",
      )
      .eq("bookings.provider_id", providerId)
      .gte("bookings.scheduled_at", fromDate.toISOString())
      .lte("bookings.scheduled_at", toDate.toISOString())
      .not("bookings.status", "in", "(cancelled,no_show)");
    if (locationId) bookingServicesQuery = bookingServicesQuery.eq("bookings.location_id", locationId);
    const { data: bookingServices } = await bookingServicesQuery;

    const serviceMap = new Map<
      string,
      { name: string; bookingIds: Set<string>; lineCount: number; revenue: number; totalDuration: number }
    >();

    (bookingServices || []).forEach((bs: any) => {
      const offeringId: string | null = bs.offering_id ?? null;
      const name = bs.offerings?.title || "Unknown Service";
      // Fall back to name-only bucket when there's genuinely no offering_id
      // (legacy rows); otherwise the offering id is the stable key.
      const key = offeringId ?? `name:${name}`;
      const existing = serviceMap.get(key) || {
        name,
        bookingIds: new Set<string>(),
        lineCount: 0,
        revenue: 0,
        totalDuration: 0,
      };
      // Keep the freshest known name in case the offering was renamed mid-period.
      existing.name = name;
      if (bs.booking_id) existing.bookingIds.add(bs.booking_id);
      existing.lineCount += 1;
      existing.revenue += Number(bs.price || 0);
      existing.totalDuration += Number(bs.duration_minutes || 0);
      serviceMap.set(key, existing);
    });

    const entries = Array.from(serviceMap.values());
    const totalRevenue = entries.reduce((s, d) => s + d.revenue, 0);
    const totalLines = entries.reduce((s, d) => s + d.lineCount, 0);

    return successResponse({
      most_popular: entries
        .map((d) => ({ service: d.name, bookings: d.bookingIds.size }))
        .sort((a, b) => b.bookings - a.bookings),
      revenue_by_service: entries
        .map((d) => ({ service: d.name, revenue: d.revenue }))
        .sort((a, b) => b.revenue - a.revenue),
      avg_duration: entries.map((d) => ({
        service: d.name,
        minutes: d.lineCount > 0 ? Math.round(d.totalDuration / d.lineCount) : 0,
      })),
      total_service_revenue: totalRevenue,
      avg_service_price: totalLines > 0 ? totalRevenue / totalLines : 0,
    });
  } catch (error) {
    console.error("Error in services report:", error);
    return handleApiError(error, "Failed to generate services report");
  }
}
