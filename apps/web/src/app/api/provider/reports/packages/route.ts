import { NextRequest } from "next/server";
import {
  requireRoleInApi,
  getProviderIdForUser,
  successResponse,
  notFoundResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { createClient } from "@supabase/supabase-js";
import { subMonths } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { dateRangeBoundsUtc, formatDateYmd } from "@/lib/dates/provider-tz";
import { getProviderReportContext } from "@/lib/reports/provider-report-utils";
import { packageReportBookedValue } from "@/lib/reports/package-report-value";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["provider_owner", "provider_staff", "superadmin"],
      request
    );
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

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
    if (period === "all") {
      fromDate = new Date(0);
      toDate = new Date();
    } else {
      const monthsBack = period === "year" ? 12 : period === "quarter" ? 3 : 1;
      const fromYmd = formatDateYmd(subMonths(zNow, monthsBack), tz);
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
      `
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
      `
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
      (b: any) =>
        b.package_id ||
        b.booking_services?.some((bs: any) => bs.offerings?.service_type === "package")
    );

    const packageMap = new Map<
      string,
      { id: string; name: string; sold: number; revenue: number }
    >();

    packageBookings.forEach((booking: any) => {
      if (booking.package_id && booking.service_packages) {
        const pkg = booking.service_packages;
        const existing = packageMap.get(pkg.id) || {
          id: pkg.id,
          name: pkg.name || "Unknown Package",
          sold: 0,
          revenue: 0,
        };
        existing.sold += 1;
        const lineSum =
          (booking.booking_services || []).reduce(
            (sum: number, bs: { price?: number | null }) => sum + Number(bs.price || 0),
            0
          ) || 0;
        existing.revenue += packageReportBookedValue({
          catalogPrice: pkg.price,
          catalogDiscountPercent: pkg.discount_percentage,
          bookingServicesLineSum: lineSum,
        });
        packageMap.set(pkg.id, existing);
      } else {
        booking.booking_services?.forEach((bs: any) => {
          if (bs.offerings?.service_type === "package") {
            const pid = bs.offerings.id;
            const existing = packageMap.get(pid) || {
              id: pid,
              name: bs.offerings.title || "Unknown Package",
              sold: 0,
              revenue: 0,
            };
            existing.sold += 1;
            existing.revenue += Number(bs.price || booking.total_amount || 0);
            packageMap.set(pid, existing);
          }
        });
      }
    });

    (groupBookings || []).forEach((group: any) => {
      if (!group.package_id || !group.service_packages) return;
      const pkg = group.service_packages;
      const existing = packageMap.get(pkg.id) || {
        id: pkg.id,
        name: pkg.name || "Unknown Package",
        sold: 0,
        revenue: 0,
      };
      existing.sold += 1;
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
      active_count: number;
      usage_rate: number | null;
      avg_completion_days: number | null;
      services_included: number;
    }[] = [];

    (servicePackages || []).forEach((spkg: any) => {
      const agg = packageMap.get(spkg.id) || {
        id: spkg.id,
        name: spkg.name || "Unknown",
        sold: 0,
        revenue: 0,
      };
      const itemsCount = Array.isArray(spkg.service_package_items)
        ? spkg.service_package_items.length
        : 0;
      packagesList.push({
        id: agg.id,
        name: agg.name,
        total_sold: agg.sold,
        total_revenue: agg.revenue,
        active_count: agg.sold,
        usage_rate: null,
        avg_completion_days: null,
        services_included: itemsCount,
      });
    });

    const total_sold = packagesList.reduce((s, p) => s + p.total_sold, 0);
    const total_revenue = packagesList.reduce((s, p) => s + p.total_revenue, 0);

    return successResponse({
      stats: {
        total_packages: packagesList.length,
        total_sold,
        total_revenue,
        active_subscriptions: null,
        avg_usage_rate: null,
      },
      packages: packagesList.sort((a, b) => b.total_revenue - a.total_revenue),
    });
  } catch (error) {
    return handleApiError(error, "PACKAGE_REPORT_ERROR", 500);
  }
}
