import { NextRequest } from "next/server";
import {  requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError  } from "@/lib/supabase/api-helpers";
import { requireProviderReportsAccess } from "@/lib/reports/require-provider-reports-access";
import { createClient } from "@supabase/supabase-js";
import { getProviderNetAfterRefundsByBooking } from "@/lib/reports/revenue-helpers";
import { MAX_BOOKINGS_FOR_REPORT, MAX_REPORT_DAYS } from "@/lib/reports/constants";
import { getProviderReportContext, reportDateRangeFromParams } from "@/lib/reports/provider-report-utils";

export async function GET(request: NextRequest) {
  try {
    const permissionCheck = await requireProviderReportsAccess(request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    const providerId = await getProviderIdForUser(user.id, supabaseAdmin);

    if (!providerId) return notFoundResponse("Provider not found");

    const searchParams = request.nextUrl.searchParams;
    const reportContext = await getProviderReportContext(supabaseAdmin, providerId);
    const { fromDate, toDate } = reportDateRangeFromParams(searchParams, reportContext.timezone, {
      defaultDays: 30,
      maxDays: MAX_REPORT_DAYS,
    });
    const locationId = searchParams.get("location_id") || undefined;

    // Get all bookings with services in window (all statuses — mirrors Sales Summary allocation)
    let bookingsQuery = supabaseAdmin
      .from("bookings")
      .select(
        `
        id,
        total_amount,
        scheduled_at,
        status,
        booking_services (
          id,
          price,
          offering_id,
          offerings:offering_id (
            id,
            title,
            duration_minutes,
            provider_category_id
          )
        )
      `
      )
      .eq("provider_id", providerId)
      .gte("scheduled_at", fromDate.toISOString())
      .lte("scheduled_at", toDate.toISOString())
      .order("scheduled_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(MAX_BOOKINGS_FOR_REPORT);

    if (locationId) {
      bookingsQuery = bookingsQuery.eq("location_id", locationId);
    }

    const { data: bookings, error: bookingsError } = await bookingsQuery;

    if (bookingsError) {
      console.error("Error fetching bookings:", bookingsError);
      return handleApiError(
        new Error(`Failed to fetch bookings: ${bookingsError.message}`),
        "BOOKINGS_FETCH_ERROR",
        500
      );
    }

    // Get category information separately to avoid deep nesting
    const categoryIds = new Set<string>();
    bookings?.forEach((booking: any) => {
      booking.booking_services?.forEach((bs: any) => {
        if (bs.offerings?.provider_category_id) {
          categoryIds.add(bs.offerings.provider_category_id);
        }
      });
    });

    const categoryMap = new Map<string, string>();
    if (categoryIds.size > 0) {
      const { data: categories, error: categoryError } = await supabaseAdmin
        .from("provider_categories")
        .select("id, name")
        .in("id", Array.from(categoryIds));

      if (categoryError) {
        console.warn("Error fetching categories:", categoryError);
        // Continue without category names - will default to "Uncategorized"
      } else {
        categories?.forEach((cat: any) => {
          categoryMap.set(cat.id, cat.name || "Uncategorized");
        });
      }
    }

    // Use net-after-refunds recognized revenue per booking — same basis as Sales Summary
    const revenueByBooking = await getProviderNetAfterRefundsByBooking(
      supabaseAdmin,
      providerId,
      fromDate,
      toDate,
      locationId ?? null,
    );

    /** Unique bookings per category (a multi-service booking counts once per category it touches). */
    const categoryBookingSets = new Map<string, Set<string>>();

    // Aggregate by service - distribute booking ledger net proportionally across service lines
    const serviceMap = new Map<string, {
      serviceId: string;
      serviceName: string;
      category: string;
      duration: number;
      bookingIds: Set<string>;
      revenue: number;
    }>();

    (bookings || []).forEach((booking: any) => {
      const bookingRevenue = revenueByBooking.get(booking.id) || 0;
      if (!booking.booking_services || !Array.isArray(booking.booking_services)) return;

      const totalServicePrice = booking.booking_services.reduce(
        (sum: number, s: any) => sum + Number(s.price || 0),
        0
      );

      booking.booking_services.forEach((bs: any) => {
        const service = bs.offerings;
        if (!service) return;

        const serviceId = service.id;
        const categoryName = service.provider_category_id
          ? (categoryMap.get(service.provider_category_id) || "Uncategorized")
          : "Uncategorized";
        const existing = serviceMap.get(serviceId) || {
          serviceId,
          serviceName: service.title || "Unknown",
          category: categoryName,
          duration: service.duration_minutes || 0,
          bookingIds: new Set<string>(),
          revenue: 0,
        };

        existing.bookingIds.add(booking.id);
        const serviceProportion = totalServicePrice > 0
          ? Number(bs.price || 0) / totalServicePrice
          : 1 / booking.booking_services.length;
        existing.revenue += bookingRevenue * serviceProportion;
        const catSet = categoryBookingSets.get(categoryName) ?? new Set<string>();
        catSet.add(booking.id);
        categoryBookingSets.set(categoryName, catSet);
        serviceMap.set(serviceId, existing);
      });
    });

    // Calculate averages and sort
    const servicePerformance = Array.from(serviceMap.values())
      .map((service) => {
        const bc = service.bookingIds.size;
        const avgPerBooking = bc > 0 ? service.revenue / bc : 0;
        return {
          serviceId: service.serviceId,
          serviceName: service.serviceName,
          category: service.category,
          duration: service.duration,
          bookings: bc,
          revenue: service.revenue,
          /** Mean ledger net allocated to this service line per booking that included it. */
          averageRevenuePerBooking: avgPerBooking,
          /** @deprecated Use averageRevenuePerBooking — kept for CSV/export compat */
          averagePrice: avgPerBooking,
        };
      })
      .sort((a, b) => b.revenue - a.revenue);

    // Aggregate by category (unique bookings per category — not sum of per-service booking counts)
    const categoryPerformanceMap = new Map<string, {
      categoryName: string;
      services: number;
      revenue: number;
    }>();

    servicePerformance.forEach((service) => {
      const existing = categoryPerformanceMap.get(service.category) || {
        categoryName: service.category,
        services: 0,
        revenue: 0,
      };
      existing.services += 1;
      existing.revenue += service.revenue;
      categoryPerformanceMap.set(service.category, existing);
    });

    const categoryPerformance = Array.from(categoryPerformanceMap.entries())
      .map(([categoryName, row]) => ({
        categoryName: row.categoryName,
        services: row.services,
        bookings: categoryBookingSets.get(categoryName)?.size ?? 0,
        revenue: row.revenue,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    // Summary metrics — all bookings in period (each booking once, all statuses)
    const totalServices = servicePerformance.length;
    const bookingsInPeriod = bookings?.length ?? 0;
    const totalRevenue = servicePerformance.reduce((sum, s) => sum + s.revenue, 0);
    const averageServiceRevenue = totalServices > 0 ? totalRevenue / totalServices : 0;

    return successResponse({
      totalServices,
      /** All appointments in range (each booking once, all statuses). */
      totalBookings: bookingsInPeriod,
      totalRevenue,
      averageServiceRevenue,
      topServices: servicePerformance.slice(0, 10),
      categoryPerformance,
      allServices: servicePerformance,
      basisNote:
        "Recognized provider revenue net of refund clawbacks per booking (same basis as Sales Summary), split across service lines by each line's share of the booking catalogue subtotal. Includes all booking statuses by scheduled date. Cash or terminal-only settlements may have no ledger rows.",
      reportBasis:
        "All bookings by scheduled date (all statuses); ledger net allocated by line price share. Uses recognized net-after-refunds revenue — matches Sales Summary appointment ledger sub-total.",
    });
  } catch (error) {
    return handleApiError(error, "SERVICE_PERFORMANCE_ERROR", 500);
  }
}
