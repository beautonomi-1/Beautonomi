import { NextRequest } from "next/server";
import {
  requireRoleInApi,
  getProviderIdForUser,
  successResponse,
  notFoundResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { MAX_REPORT_DAYS } from "@/lib/reports/constants";
import { getProviderReportContext, reportDateRangeFromParams } from "@/lib/reports/provider-report-utils";
import { packageReportBookedValue } from "@/lib/reports/package-report-value";
import {
  asSingleRelation,
  bookingServiceLineIsPackage,
  offeringFromBookingService,
} from "@/lib/reports/normalize-booking-relations";

/**
 * GET /api/provider/reports/packages/sales
 *
 * Booked package **value** per catalog package from confirm/completed bookings and qualifying group bookings,
 * windowed by **scheduled_at**. Uses packageReportBookedValue (catalog price or discounted line sum — not booking.total_amount).
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff", "superadmin"], request);
    const supabaseAdmin = getSupabaseAdmin();

    const providerId = await getProviderIdForUser(user.id, supabaseAdmin);
    if (!providerId) return notFoundResponse("Provider not found");

    const searchParams = request.nextUrl.searchParams;
    const reportContext = await getProviderReportContext(supabaseAdmin, providerId);
    const { fromDate, toDate, fromYmd, toYmd } = reportDateRangeFromParams(searchParams, reportContext.timezone, {
      defaultDays: 30,
      maxDays: MAX_REPORT_DAYS,
    });
    const locationId = searchParams.get("location_id") || undefined;

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
      `,
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
      return handleApiError(new Error(bookingsError.message || "Failed to fetch bookings"), "BOOKINGS_FETCH_ERROR", 500);
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
      `,
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
        new Error(groupBookingsError.message || "Failed to fetch group bookings"),
        "GROUP_BOOKINGS_FETCH_ERROR",
        500,
      );
    }

    const packageBookings =
      bookings?.filter(
        (booking) =>
          booking.package_id ||
          booking.booking_services?.some((bs) => bookingServiceLineIsPackage(bs)),
      ) || [];

    const packageMap = new Map<
      string,
      {
        packageId: string;
        packageName: string;
        bookings: number;
        revenue: number;
        averageValue: number;
      }
    >();

    packageBookings.forEach((booking) => {
      const pkg = asSingleRelation<{
        id: string;
        name?: string;
        price?: unknown;
        discount_percentage?: unknown;
      }>((booking as { service_packages?: unknown }).service_packages);
      if (booking.package_id && pkg) {
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
          ((booking as { booking_services?: { price?: number | null }[] }).booking_services || []).reduce(
            (sum: number, bs: { price?: number | null }) => sum + Number(bs.price || 0),
            0,
          ) || 0;
        existing.revenue += packageReportBookedValue({
          catalogPrice: pkg.price as number | null | undefined,
          catalogDiscountPercent: pkg.discount_percentage as number | null | undefined,
          bookingServicesLineSum: lineSum,
        });
        packageMap.set(packageId, existing);
        return;
      }

      booking.booking_services?.forEach((bs: { price?: number | null; offerings?: unknown }) => {
        const off = offeringFromBookingService(bs);
        if (off?.service_type === "package" && off.id) {
          const packageId = off.id;
          const existing = packageMap.get(packageId) || {
            packageId,
            packageName: off.title || "Unknown Package",
            bookings: 0,
            revenue: 0,
            averageValue: 0,
          };
          existing.bookings += 1;
          existing.revenue += Number(bs.price || (booking as { total_amount?: number }).total_amount || 0);
          packageMap.set(packageId, existing);
        }
      });
    });

    (groupBookings || []).forEach((group: Record<string, unknown>) => {
      const pkg = asSingleRelation<{
        id: string;
        name?: string;
        price?: unknown;
        discount_percentage?: unknown;
      }>(group.service_packages);
      if (!group.package_id || !pkg) return;
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
        ((group.booking_participants as { price?: number | null }[]) || []).reduce(
          (sum: number, p: { price?: number | null }) => sum + Number(p.price || 0),
          0,
        ) || 0;
      existing.revenue += packageReportBookedValue({
        catalogPrice: pkg.price as number | null | undefined,
        catalogDiscountPercent: pkg.discount_percentage as number | null | undefined,
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

    const reportBasis =
      `Period ${fromYmd}–${toYmd} (${reportContext.timezone}). ` +
      `Includes bookings with scheduled_at in range, status confirmed or completed, ` +
      `with package_id set (service_packages join) or legacy booking_services lines whose offering service_type is package. ` +
      `Plus group_bookings with package_id and status in booked, started, confirmed, completed. ` +
      `Revenue per row uses packageReportBookedValue (catalog package price when set, else %-discount net on service lines, else sum of line prices / legacy line price) — not booking.total_amount, so tips, travel fees, and unrelated add-ons do not inflate totals.`;

    return successResponse({
      timezone: reportContext.timezone,
      fromYmd,
      toYmd,
      reportBasis,
      basis: {
        window: "scheduled_at for both bookings and group_bookings.",
        bookingStatuses: "Individual bookings: confirmed, completed. Group: booked, started, confirmed, completed.",
        revenue: "packageReportBookedValue from lib/reports/package-report-value.ts.",
        counts: "bookings = number of qualifying appointments/group events per package definition.",
      },
      totalPackagesSold,
      totalRevenue,
      averagePackageValue,
      packageSales,
      report_basis: reportBasis,
    });
  } catch (error) {
    console.error("packages/sales:", error);
    return handleApiError(error, "Failed to generate package sales report");
  }
}
