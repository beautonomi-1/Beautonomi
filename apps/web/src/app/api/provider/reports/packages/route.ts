import { NextRequest } from "next/server";
import {
  requireRoleInApi,
  getProviderIdForUser,
  successResponse,
  notFoundResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { subMonths } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { dateRangeBoundsUtc, formatDateYmd } from "@/lib/dates/provider-tz";
import { getProviderReportContext } from "@/lib/reports/provider-report-utils";
import { packageReportBookedValue } from "@/lib/reports/package-report-value";
import {
  asSingleRelation,
  bookingServiceLineIsPackage,
  offeringFromBookingService,
} from "@/lib/reports/normalize-booking-relations";

/**
 * GET /api/provider/reports/packages
 *
 * **Overview**: every **active** catalog `service_packages` row with aggregated booked value and counts
 * in the selected period (same booking/group rules as …/packages/sales). Rows with zero sales still appear with zeros.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff", "superadmin"], request);
    const supabaseAdmin = getSupabaseAdmin();

    const providerId = await getProviderIdForUser(user.id, supabaseAdmin);
    if (!providerId) return notFoundResponse("Provider not found");

    const sp = request.nextUrl.searchParams;
    const period = sp.get("period") || "month";
    const locationId = sp.get("location_id") || null;

    const reportContext = await getProviderReportContext(supabaseAdmin, providerId);
    const tz = reportContext.timezone;
    const todayYmd = formatDateYmd(new Date(), tz);
    const zNow = toZonedTime(new Date(), tz);

    let fromDate: Date;
    let toDate: Date;
    let fromYmd = "";
    let toYmd = todayYmd;
    if (period === "all") {
      fromDate = new Date(0);
      toDate = new Date();
      fromYmd = "1970-01-01";
      toYmd = todayYmd;
    } else {
      const monthsBack = period === "year" ? 12 : period === "quarter" ? 3 : 1;
      fromYmd = formatDateYmd(subMonths(zNow, monthsBack), tz);
      const { fromIso, toIso } = dateRangeBoundsUtc(fromYmd, todayYmd, tz);
      fromDate = new Date(fromIso);
      toDate = new Date(toIso);
    }

    let bookingsQuery = supabaseAdmin
      .from("bookings")
      .select(
        `
        id,
        total_amount,
        scheduled_at,
        status,
        package_id,
        service_packages:package_id (id, name, price, discount_percentage),
        booking_services (id, price, offering_id, offerings:offering_id (id, title, service_type))
      `,
      )
      .eq("provider_id", providerId)
      .in("status", ["confirmed", "completed"]);
    if (period !== "all") {
      bookingsQuery = bookingsQuery
        .gte("scheduled_at", fromDate.toISOString())
        .lte("scheduled_at", toDate.toISOString());
    }
    if (locationId) bookingsQuery = bookingsQuery.eq("location_id", locationId);

    const { data: bookings, error: bookingsError } = await bookingsQuery;
    if (bookingsError) throw bookingsError;

    let groupBookingsQuery = supabaseAdmin
      .from("group_bookings")
      .select(
        `
        id,
        scheduled_at,
        status,
        package_id,
        service_packages:package_id (id, name, price, discount_percentage),
        booking_participants (id, price)
      `,
      )
      .eq("provider_id", providerId)
      .in("status", ["booked", "started", "confirmed", "completed"])
      .not("package_id", "is", null);
    if (period !== "all") {
      groupBookingsQuery = groupBookingsQuery
        .gte("scheduled_at", fromDate.toISOString())
        .lte("scheduled_at", toDate.toISOString());
    }
    if (locationId) groupBookingsQuery = groupBookingsQuery.eq("location_id", locationId);

    const { data: groupBookings, error: groupBookingsError } = await groupBookingsQuery;
    if (groupBookingsError) throw groupBookingsError;

    const packageBookings = (bookings || []).filter(
      (b) => b.package_id || b.booking_services?.some((bs) => bookingServiceLineIsPackage(bs)),
    );

    const packageMap = new Map<string, { id: string; name: string; sold: number; revenue: number }>();

    packageBookings.forEach((booking: Record<string, unknown>) => {
      const pkg = asSingleRelation<{
        id: string;
        name?: string;
        price?: unknown;
        discount_percentage?: unknown;
      }>(booking.service_packages);
      if (booking.package_id && pkg) {
        const existing = packageMap.get(pkg.id) || {
          id: pkg.id,
          name: pkg.name || "Unknown Package",
          sold: 0,
          revenue: 0,
        };
        existing.sold += 1;
        const lineSum =
          ((booking.booking_services as { price?: number | null }[]) || []).reduce(
            (sum: number, bs: { price?: number | null }) => sum + Number(bs.price || 0),
            0,
          ) || 0;
        existing.revenue += packageReportBookedValue({
          catalogPrice: pkg.price as number | null | undefined,
          catalogDiscountPercent: pkg.discount_percentage as number | null | undefined,
          bookingServicesLineSum: lineSum,
        });
        packageMap.set(pkg.id, existing);
      } else {
        (booking.booking_services as Array<{ price?: number | null; offerings?: unknown }> | undefined)?.forEach((bs) => {
          const off = offeringFromBookingService(bs);
          if (off?.service_type === "package" && off.id) {
            const pid = off.id;
            const existing = packageMap.get(pid) || {
              id: pid,
              name: off.title || "Unknown Package",
              sold: 0,
              revenue: 0,
            };
            existing.sold += 1;
            existing.revenue += Number(bs.price || (booking.total_amount as number) || 0);
            packageMap.set(pid, existing);
          }
        });
      }
    });

    (groupBookings || []).forEach((group: Record<string, unknown>) => {
      const pkg = asSingleRelation<{
        id: string;
        name?: string;
        price?: unknown;
        discount_percentage?: unknown;
      }>(group.service_packages);
      if (!group.package_id || !pkg) return;
      const existing = packageMap.get(pkg.id) || {
        id: pkg.id,
        name: pkg.name || "Unknown Package",
        sold: 0,
        revenue: 0,
      };
      existing.sold += 1;
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
      packageMap.set(pkg.id, existing);
    });

    const { data: servicePackages } = await supabaseAdmin
      .from("service_packages")
      .select("id, name, service_package_items(id)")
      .eq("provider_id", providerId)
      .eq("is_active", true);

    const packagesList: {
      id: string;
      name: string;
      total_sold: number;
      total_revenue: number;
      services_included: number;
    }[] = [];

    (servicePackages || []).forEach((spkg: { id: string; name?: string; service_package_items?: unknown[] }) => {
      const agg = packageMap.get(spkg.id) || {
        id: spkg.id,
        name: spkg.name || "Unknown",
        sold: 0,
        revenue: 0,
      };
      const itemsCount = Array.isArray(spkg.service_package_items) ? spkg.service_package_items.length : 0;
      packagesList.push({
        id: agg.id,
        name: agg.name,
        total_sold: agg.sold,
        total_revenue: agg.revenue,
        services_included: itemsCount,
      });
    });

    const total_sold = packagesList.reduce((s, p) => s + p.total_sold, 0);
    const total_revenue = packagesList.reduce((s, p) => s + p.total_revenue, 0);

    const reportBasis =
      period === "all"
        ? `All time (scheduled_at unfiltered for bookings query; group bookings same). Lists each active catalog package with booked counts/value using the same packageReportBookedValue rules as Package Sales.`
        : `Calendar period derived in ${tz}: roughly last ${period === "year" ? "12 months" : period === "quarter" ? "quarter" : "month"} through today. Window uses scheduled_at bounds.`;

    return successResponse({
      timezone: tz,
      period,
      fromYmd: period === "all" ? fromYmd : fromYmd,
      toYmd,
      reportBasis,
      basis: {
        catalog: "Rows from service_packages where is_active for this provider.",
        aggregates: "Per-package booked event count and revenue in period (zeros if none).",
        revenue: "Same packageReportBookedValue helper as …/packages/sales.",
      },
      stats: {
        total_packages: packagesList.length,
        total_sold,
        total_revenue,
      },
      packages: packagesList.sort((a, b) => b.total_revenue - a.total_revenue),
    });
  } catch (error) {
    return handleApiError(error, "PACKAGE_REPORT_ERROR", 500);
  }
}
