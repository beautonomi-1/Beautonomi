import { NextRequest } from "next/server";
import {  requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError  } from "@/lib/supabase/api-helpers";
import { createClient } from "@supabase/supabase-js";
import { subDays } from "date-fns";
import { getProviderRevenue } from "@/lib/reports/revenue-helpers";

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

    // Get bookings with services (simplified query to avoid deep nesting)
    const { data: bookings, error: bookingsError } = await supabaseAdmin
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
      .in("status", ["confirmed", "completed"]);

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

    // Get provider revenue from finance_transactions (actual earnings - consistent with other reports)
    const { revenueByBooking } = await getProviderRevenue(
      supabaseAdmin,
      providerId,
      fromDate,
      toDate
    );

    // Aggregate by service - distribute booking revenue proportionally across services
    const serviceMap = new Map<string, {
      serviceId: string;
      serviceName: string;
      category: string;
      duration: number;
      bookings: number;
      revenue: number;
      averagePrice: number;
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
          bookings: 0,
          revenue: 0,
          averagePrice: 0,
        };

        existing.bookings += 1;
        const serviceProportion = totalServicePrice > 0
          ? Number(bs.price || 0) / totalServicePrice
          : 1 / booking.booking_services.length;
        existing.revenue += bookingRevenue * serviceProportion;
        serviceMap.set(serviceId, existing);
      });
    });

    // Calculate averages and sort
    const servicePerformance = Array.from(serviceMap.values())
      .map((service) => ({
        ...service,
        averagePrice: service.bookings > 0 ? service.revenue / service.bookings : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    // Aggregate by category
    const categoryPerformanceMap = new Map<string, {
      categoryName: string;
      services: number;
      bookings: number;
      revenue: number;
    }>();

    servicePerformance.forEach((service) => {
      const existing = categoryPerformanceMap.get(service.category) || {
        categoryName: service.category,
        services: 0,
        bookings: 0,
        revenue: 0,
      };
      existing.services += 1;
      existing.bookings += service.bookings;
      existing.revenue += service.revenue;
      categoryPerformanceMap.set(service.category, existing);
    });

    const categoryPerformance = Array.from(categoryPerformanceMap.values())
      .sort((a, b) => b.revenue - a.revenue);

    // Summary metrics
    const totalServices = servicePerformance.length;
    const totalBookings = servicePerformance.reduce((sum, s) => sum + s.bookings, 0);
    const totalRevenue = servicePerformance.reduce((sum, s) => sum + s.revenue, 0);
    const averageServiceRevenue = totalServices > 0 ? totalRevenue / totalServices : 0;

    return successResponse({
      totalServices,
      totalBookings,
      totalRevenue,
      averageServiceRevenue,
      topServices: servicePerformance.slice(0, 10),
      categoryPerformance,
      allServices: servicePerformance,
    });
  } catch (error) {
    return handleApiError(error, "SERVICE_PERFORMANCE_ERROR", 500);
  }
}
