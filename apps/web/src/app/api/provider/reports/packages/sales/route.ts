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
      : subDays(new Date(), 30);
    const toDate = searchParams.get("to")
      ? new Date(searchParams.get("to")!)
      : new Date();

    // Get bookings with packages (both via package_id and via booking_services with service_type='package')
    const { data: bookings, error: bookingsError } = await supabaseAdmin
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
          price
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

    // Aggregate package sales
    const packageMap = new Map<string, {
      packageId: string;
      packageName: string;
      bookings: number;
      revenue: number;
      averageValue: number;
    }>();

    packageBookings.forEach((booking) => {
      // Handle bookings with package_id (newer approach)
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
        existing.revenue += Number(booking.total_amount || 0);
        packageMap.set(packageId, existing);
      }
      
      // Handle bookings with package services (legacy approach)
      booking.booking_services?.forEach((bs: any) => {
        if (bs.offerings?.service_type === 'package') {
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

    const packageSales = Array.from(packageMap.values())
      .map((pkg) => ({
        ...pkg,
        averageValue: pkg.bookings > 0 ? pkg.revenue / pkg.bookings : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    const totalPackagesSold = packageSales.reduce((sum, p) => sum + p.bookings, 0);
    const totalRevenue = packageSales.reduce((sum, p) => sum + p.revenue, 0);
    const averagePackageValue = packageSales.length > 0 ? totalRevenue / totalPackagesSold : 0;

    return successResponse({
      totalPackagesSold,
      totalRevenue,
      averagePackageValue,
      packageSales,
    });
  } catch (error) {
    return handleApiError(error, "PACKAGE_SALES_ERROR", 500);
  }
}
