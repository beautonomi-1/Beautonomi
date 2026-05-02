import { NextRequest } from "next/server";
import {  requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError  } from "@/lib/supabase/api-helpers";
import { createClient } from "@supabase/supabase-js";
import { MAX_REPORT_DAYS } from "@/lib/reports/constants";
import { getProviderReportContext, reportDateRangeFromParams } from "@/lib/reports/provider-report-utils";
import { packageReportBookedValue } from "@/lib/reports/package-report-value";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);    const supabaseAdmin = createClient(
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

    // Get bookings with packages (both via package_id and via booking_services with service_type='package')
    let bookingsQuery = supabaseAdmin
      .from("bookings")
      .select(
        `
        id,
        total_amount,
        scheduled_at,
        status,
        package_id,
        service_packages:package_id (
          id,
          name,
          price,
          discount_percentage
        ),
        booking_services (
          id,
          price,
          offering_id,
          offerings:offering_id (
            id,
            title,
            service_type
          )
        )
      `
      )
      .eq("provider_id", providerId)
      .gte("scheduled_at", fromDate.toISOString())
      .lte("scheduled_at", toDate.toISOString())
      .in("status", ["confirmed", "completed"]);

    if (locationId) {
      bookingsQuery = bookingsQuery.eq("location_id", locationId);
    }

    const { data: bookings, error: bookingsError } = await bookingsQuery;

    if (bookingsError) {
      return handleApiError(
        new Error("Failed to fetch bookings"),
        "BOOKINGS_FETCH_ERROR",
        500
      );
    }

    let groupBookingsQuery = supabaseAdmin
      .from("group_bookings")
      .select(
        `
        id,
        scheduled_at,
        status,
        package_id,
        service_packages:package_id (
          id,
          name,
          price,
          discount_percentage
        ),
        booking_participants (
          id,
          price
        )
      `
      )
      .eq("provider_id", providerId)
      .gte("scheduled_at", fromDate.toISOString())
      .lte("scheduled_at", toDate.toISOString())
      .in("status", ["booked", "started", "confirmed", "completed"])
      .not("package_id", "is", null);

    if (locationId) {
      groupBookingsQuery = groupBookingsQuery.eq("location_id", locationId);
    }

    const { data: groupBookings, error: groupBookingsError } = await groupBookingsQuery;
    if (groupBookingsError) {
      return handleApiError(
        new Error("Failed to fetch group bookings"),
        "GROUP_BOOKINGS_FETCH_ERROR",
        500
      );
    }

    // Filter for bookings with packages (either via package_id or service_type = 'package')
    const packageBookings = bookings?.filter((booking) =>
      booking.package_id || 
      booking.booking_services?.some((bs: any) => bs.offerings?.service_type === 'package')
    ) || [];

    // Aggregate booked package value. Use package/service line prices instead of booking.total_amount
    // so travel fees, tips, and other booking-level amounts do not inflate package reporting.
    const packageMap = new Map<string, {
      packageId: string;
      packageName: string;
      bookings: number;
      revenue: number;
      averageValue: number;
    }>();

    packageBookings.forEach((booking) => {
      // Prefer package_id row (one booking = one sale); avoid double-counting legacy rows
      if (booking.package_id && (booking as any).service_packages) {
        const pkg = (booking as any).service_packages;
        const packageId = pkg.id;
        const existing = packageMap.get(packageId) || {
          packageId,
          packageName: pkg.name || "Unknown Package",
          bookings: 0,
          revenue: 0,
          averageValue: 0,
        };
        existing.bookings += 1;
        const lineSum =
          ((booking as any).booking_services || []).reduce(
            (sum: number, bs: { price?: number | null }) => sum + Number(bs.price || 0),
            0
          ) || 0;
        existing.revenue += packageReportBookedValue({
          catalogPrice: pkg.price,
          catalogDiscountPercent: pkg.discount_percentage,
          bookingServicesLineSum: lineSum,
        });
        packageMap.set(packageId, existing);
        return;
      }

      // Legacy: package represented only as line items
      booking.booking_services?.forEach((bs: any) => {
        if (bs.offerings?.service_type === "package") {
          const packageId = bs.offerings.id;
          const existing = packageMap.get(packageId) || {
            packageId,
            packageName: bs.offerings.title || "Unknown Package",
            bookings: 0,
            revenue: 0,
            averageValue: 0,
          };
          existing.bookings += 1;
          existing.revenue += Number(bs.price || booking.total_amount || 0);
          packageMap.set(packageId, existing);
        }
      });
    });

    (groupBookings || []).forEach((group: any) => {
      if (!group.package_id || !group.service_packages) return;
      const pkg = group.service_packages;
      const packageId = pkg.id;
      const existing = packageMap.get(packageId) || {
        packageId,
        packageName: pkg.name || "Unknown Package",
        bookings: 0,
        revenue: 0,
        averageValue: 0,
      };
      existing.bookings += 1;
      const lineSum =
        (group.booking_participants || []).reduce(
          (sum: number, p: { price?: number | null }) => sum + Number(p.price || 0),
          0
        ) || 0;
      existing.revenue += packageReportBookedValue({
        catalogPrice: pkg.price,
        catalogDiscountPercent: pkg.discount_percentage,
        bookingServicesLineSum: lineSum,
      });
      packageMap.set(packageId, existing);
    });

    const packageSales = Array.from(packageMap.values())
      .map((pkg) => ({
        ...pkg,
        averageValue: pkg.bookings > 0 ? pkg.revenue / pkg.bookings : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    const totalPackagesSold = packageSales.reduce((sum, p) => sum + p.bookings, 0);
    const totalRevenue = packageSales.reduce((sum, p) => sum + p.revenue, 0);
    const averagePackageValue = totalPackagesSold > 0 ? totalRevenue / totalPackagesSold : 0;

    return successResponse({
      totalPackagesSold,
      totalRevenue,
      averagePackageValue,
      packageSales,
      reportBasis:
        "Package value is based on package/service line prices for confirmed/completed bookings and active group bookings by scheduled date. Booking-level travel fees, tips, add-ons, and Platform Fees are excluded.",
    });
  } catch (error) {
    return handleApiError(error, "PACKAGE_SALES_ERROR", 500);
  }
}
