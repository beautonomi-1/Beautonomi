import { NextRequest } from "next/server";
import {  requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError  } from "@/lib/supabase/api-helpers";
import { createClient } from "@supabase/supabase-js";
import { subDays } from "date-fns";

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


    const { data: providerData, error: providerError } = await supabaseAdmin
      .from('providers')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (providerError || !providerData?.id) {
      return handleApiError(
        new Error('Provider profile not found'),
        'NOT_FOUND',
        404
      );
    }
    const searchParams = request.nextUrl.searchParams;
    const fromDate = searchParams.get("from")
      ? new Date(searchParams.get("from")!)
      : subDays(new Date(), 90);
    const toDate = searchParams.get("to")
      ? new Date(searchParams.get("to")!)
      : new Date();

    // Get bookings with packages (both via package_id and via booking_services with service_type='package')
    const { data: bookings, error: bookingsError } = await supabaseAdmin
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
      `
      )
      .eq("provider_id", providerId)
      .gte("scheduled_at", fromDate.toISOString())
      .lte("scheduled_at", toDate.toISOString())
      .in("status", ["confirmed", "completed"]);

    if (bookingsError) {
      return handleApiError(
        new Error("Failed to fetch bookings"),
        "BOOKINGS_FETCH_ERROR",
        500
      );
    }

    // Filter for bookings with packages (either via package_id or service_type = 'package')
    const packageBookings = bookings?.filter((booking) =>
      booking.package_id || 
      booking.booking_services?.some((bs: any) => bs.offerings?.service_type === 'package')
    ) || [];

    // Aggregate by package
    const packageMap = new Map<string, {
      packageId: string;
      packageName: string;
      totalUsage: number;
      uniqueClients: Set<string>;
      averageUsagePerClient: number;
    }>();

    packageBookings.forEach((booking) => {
      // Handle bookings with package_id (newer approach)
      if (booking.package_id && (booking as any).service_packages) {
        const pkg = (booking as any).service_packages;
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
          existing.uniqueClients.add(booking.customer_id);
        }
        packageMap.set(packageId, existing);
      }
      
      // Handle bookings with package services (legacy approach)
      booking.booking_services?.forEach((bs: any) => {
        if (bs.offerings?.service_type === 'package') {
          const packageId = bs.offerings.id;
          const existing = packageMap.get(packageId) || {
            packageId,
            packageName: bs.offerings.title || "Unknown Package",
            totalUsage: 0,
            uniqueClients: new Set<string>(),
            averageUsagePerClient: 0,
          };
          existing.totalUsage += 1;
          if (booking.customer_id) {
            existing.uniqueClients.add(booking.customer_id);
          }
          packageMap.set(packageId, existing);
        }
      });
    });

    const packageUsage = Array.from(packageMap.values())
      .map((pkg) => ({
        ...pkg,
        uniqueClientsCount: pkg.uniqueClients.size,
        averageUsagePerClient: pkg.uniqueClients.size > 0 ? pkg.totalUsage / pkg.uniqueClients.size : 0,
      }))
      .sort((a, b) => b.totalUsage - a.totalUsage);

    // Aggregate by client
    const clientMap = new Map<string, {
      clientId: string;
      clientName: string;
      email: string;
      packagesUsed: number;
    }>();

    packageBookings.forEach((booking) => {
      const clientId = booking.customer_id;
      if (!clientId) return;

      const client = booking.users as any;
      const existing = clientMap.get(clientId) || {
        clientId,
        clientName: client?.full_name || "Unknown",
        email: client?.email || "",
        packagesUsed: 0,
      };
      existing.packagesUsed += 1;
      clientMap.set(clientId, existing);
    });

    const topClients = Array.from(clientMap.values())
      .sort((a, b) => b.packagesUsed - a.packagesUsed)
      .slice(0, 20);

    const totalPackagesUsed = packageUsage.reduce((sum, p) => sum + p.totalUsage, 0);
    const totalUniqueClients = new Set(
      packageBookings.map((b) => b.customer_id).filter(Boolean)
    ).size;

    return successResponse({
      totalPackagesUsed,
      totalUniqueClients,
      packageUsage,
      topClients,
    });
  } catch (error) {
    return handleApiError(error, "PACKAGE_USAGE_ERROR", 500);
  }
}
