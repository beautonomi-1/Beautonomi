import { NextRequest } from "next/server";
import {
  requireRoleInApi,
  getProviderIdForUser,
  successResponse,
  notFoundResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { createClient } from "@supabase/supabase-js";
import { subDays, subMonths } from "date-fns";

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

    const toDate = new Date();
    let fromDate: Date;
    if (period === "all") fromDate = new Date(0);
    else if (period === "year") fromDate = subMonths(toDate, 12);
    else if (period === "quarter") fromDate = subMonths(toDate, 3);
    else fromDate = subMonths(toDate, 1);

    let bookingsQuery = supabaseAdmin
      .from("bookings")
      .select(
        `
        id,
        total_amount,
        scheduled_at,
        status,
        package_id,
        service_packages:package_id (id, name, price),
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
        existing.revenue += Number(booking.total_amount || 0);
        packageMap.set(pkg.id, existing);
      }
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
      usage_rate: number;
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
        usage_rate: agg.sold > 0 ? 1 : 0,
        avg_completion_days: null,
        services_included: itemsCount,
      });
    });

    const total_sold = packagesList.reduce((s, p) => s + p.total_sold, 0);
    const total_revenue = packagesList.reduce((s, p) => s + p.total_revenue, 0);
    const avg_usage_rate =
      packagesList.length > 0
        ? packagesList.reduce((s, p) => s + p.usage_rate, 0) / packagesList.length
        : 0;

    return successResponse({
      stats: {
        total_packages: packagesList.length,
        total_sold,
        total_revenue,
        active_subscriptions: 0,
        avg_usage_rate,
      },
      packages: packagesList.sort((a, b) => b.total_revenue - a.total_revenue),
    });
  } catch (error) {
    return handleApiError(error, "PACKAGE_REPORT_ERROR", 500);
  }
}
