import { NextRequest } from "next/server";
import {
  requireRoleInApi,
  getProviderIdForUser,
  successResponse,
  notFoundResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { requireProviderReportsAccess } from "@/lib/reports/require-provider-reports-access";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { MAX_REPORT_DAYS } from "@/lib/reports/constants";
import { getProviderReportContext, reportDateRangeFromParams } from "@/lib/reports/provider-report-utils";
import {
  asSingleRelation,
  bookingServiceLineIsPackage,
  offeringFromBookingService,
} from "@/lib/reports/normalize-booking-relations";

/**
 * GET /api/provider/reports/packages/usage
 *
 * **Usage** = count of qualifying bookings / group events per package (same inclusion rules as sales, **without** revenue math).
 * Unique clients = distinct customer_id from individual bookings **plus** participants linked through group_bookings.
 */
export async function GET(request: NextRequest) {
  try {
    const permissionCheck = await requireProviderReportsAccess(request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const supabaseAdmin = getSupabaseAdmin();

    const providerId = await getProviderIdForUser(user.id, supabaseAdmin);
    if (!providerId) return notFoundResponse("Provider not found");

    const searchParams = request.nextUrl.searchParams;
    const reportContext = await getProviderReportContext(supabaseAdmin, providerId);
    const { fromDate, toDate, fromYmd, toYmd } = reportDateRangeFromParams(searchParams, reportContext.timezone, {
      defaultDays: 90,
      maxDays: MAX_REPORT_DAYS,
    });
    const locationId = searchParams.get("location_id") || undefined;

    let bookingsQuery = supabaseAdmin
      .from("bookings")
      .select(
        `
        id,
        customer_id,
        scheduled_at,
        status,
        package_id,
        service_packages:package_id (
          id,
          name
        ),
        booking_services (
          id,
          offering_id,
          offerings:offering_id (
            id,
            title,
            service_type
          )
        ),
        users (
          full_name,
          email
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
          name
        ),
        booking_participants (
          id,
          booking_id,
          bookings:booking_id (
            customer_id
          )
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
        totalUsage: number;
        uniqueClients: Set<string>;
        averageUsagePerClient: number;
      }
    >();

    packageBookings.forEach((booking) => {
      const pkg = asSingleRelation<{ id: string; name?: string }>(
        (booking as { service_packages?: unknown }).service_packages,
      );
      if (booking.package_id && pkg) {
        const packageId = pkg.id;
        const existing = packageMap.get(packageId) || {
          packageId,
          packageName: pkg.name || "Unknown Package",
          totalUsage: 0,
          uniqueClients: new Set<string>(),
          averageUsagePerClient: 0,
        };
        existing.totalUsage += 1;
        if (booking.customer_id) {
          existing.uniqueClients.add(booking.customer_id as string);
        }
        packageMap.set(packageId, existing);
        return;
      }

      booking.booking_services?.forEach((bs: { offerings?: unknown }) => {
        const off = offeringFromBookingService(bs);
        if (off?.service_type === "package" && off.id) {
          const packageId = off.id;
          const existing = packageMap.get(packageId) || {
            packageId,
            packageName: off.title || "Unknown Package",
            totalUsage: 0,
            uniqueClients: new Set<string>(),
            averageUsagePerClient: 0,
          };
          existing.totalUsage += 1;
          if (booking.customer_id) {
            existing.uniqueClients.add(booking.customer_id as string);
          }
          packageMap.set(packageId, existing);
        }
      });
    });

    (groupBookings || []).forEach((group: Record<string, unknown>) => {
      const pkg = asSingleRelation<{ id: string; name?: string }>(group.service_packages);
      if (!group.package_id || !pkg) return;
      const packageId = pkg.id;
      const existing = packageMap.get(packageId) || {
        packageId,
        packageName: pkg.name || "Unknown Package",
        totalUsage: 0,
        uniqueClients: new Set<string>(),
        averageUsagePerClient: 0,
      };
      existing.totalUsage += 1;
      ((group.booking_participants as Array<{ bookings?: { customer_id?: string } }>) || []).forEach((participant) => {
        const customerId = participant.bookings?.customer_id;
        if (customerId) existing.uniqueClients.add(customerId);
      });
      packageMap.set(packageId, existing);
    });

    const packageUsage = Array.from(packageMap.values())
      .map((pkg) => {
        const uc = pkg.uniqueClients.size;
        return {
          packageId: pkg.packageId,
          packageName: pkg.packageName,
          totalUsage: pkg.totalUsage,
          uniqueClientsCount: uc,
          averageUsagePerClient: uc > 0 ? pkg.totalUsage / uc : 0,
        };
      })
      .sort((a, b) => b.totalUsage - a.totalUsage);

    const clientMap = new Map<
      string,
      {
        clientId: string;
        clientName: string;
        email: string;
        packagesUsed: number;
      }
    >();

    packageBookings.forEach((booking) => {
      const clientId = booking.customer_id as string | undefined;
      if (!clientId) return;

      const client = booking.users as { full_name?: string; email?: string } | undefined;
      const existing = clientMap.get(clientId) || {
        clientId,
        clientName: client?.full_name || "Unknown",
        email: client?.email || "",
        packagesUsed: 0,
      };
      existing.packagesUsed += 1;
      clientMap.set(clientId, existing);
    });

    (groupBookings || []).forEach((group: Record<string, unknown>) => {
      ((group.booking_participants as Array<{ bookings?: { customer_id?: string } }>) || []).forEach((participant) => {
        const clientId = participant.bookings?.customer_id;
        if (!clientId) return;
        const existing = clientMap.get(clientId) || {
          clientId,
          clientName: "Group participant",
          email: "",
          packagesUsed: 0,
        };
        existing.packagesUsed += 1;
        clientMap.set(clientId, existing);
      });
    });

    const topClients = Array.from(clientMap.values())
      .sort((a, b) => b.packagesUsed - a.packagesUsed)
      .slice(0, 20);

    const totalPackagesUsed = packageUsage.reduce((sum, p) => sum + p.totalUsage, 0);

    const uniqueClientIds = new Set<string>();
    packageBookings.forEach((b) => {
      if (b.customer_id) uniqueClientIds.add(b.customer_id as string);
    });
    (groupBookings || []).forEach((group: Record<string, unknown>) => {
      ((group.booking_participants as Array<{ bookings?: { customer_id?: string } }>) || []).forEach((participant) => {
        const cid = participant.bookings?.customer_id;
        if (cid) uniqueClientIds.add(cid);
      });
    });
    const totalUniqueClients = uniqueClientIds.size;

    const reportBasis =
      `Period ${fromYmd}–${toYmd} (${reportContext.timezone}). ` +
      `Usage counts qualifying appointments (and group events) with scheduled_at in range — same package detection as sales: package_id on booking or legacy package-type service lines; group_bookings with package_id. ` +
      `Per-package “avg per client” is totalUsage ÷ distinct clients who booked that package in the window. ` +
      `Top clients counts package-included bookings per customer_id (individual + group participants).`;

    return successResponse({
      timezone: reportContext.timezone,
      fromYmd,
      toYmd,
      reportBasis,
      basis: {
        usage: "One increment per qualifying booking row or group_booking event per package.",
        uniqueClients: "Union of customer_id from filtered bookings and from group booking_participants → bookings.customer_id.",
        topClients: "Up to 20 customers by number of package-included bookings in the window.",
      },
      totalPackagesUsed,
      totalUniqueClients,
      packageUsage,
      topClients,
      report_basis: reportBasis,
    });
  } catch (error) {
    console.error("packages/usage:", error);
    return handleApiError(error, "Failed to generate package usage report");
  }
}
