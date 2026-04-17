import { NextRequest } from "next/server";
import {  requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError  } from "@/lib/supabase/api-helpers";
import { createClient } from "@supabase/supabase-js";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["provider_owner", "provider_staff", "superadmin"],
      request,
    );    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const providerId = await getProviderIdForUser(user.id, supabaseAdmin);

    if (!providerId) return notFoundResponse("Provider not found");

    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "5", 10), 20);
    const locationId = searchParams.get("location_id");
    const fromParam = searchParams.get("from") || searchParams.get("start_date");
    const toParam = searchParams.get("to") || searchParams.get("end_date");

    let bookingServicesQuery = supabaseAdmin
      .from("booking_services")
      .select(
        `
        id,
        price,
        offering_id,
        bookings!inner (id, provider_id, status, location_id, scheduled_at),
        offerings:offering_id (title)
      `,
      )
      .eq("bookings.provider_id", providerId)
      .not("bookings.status", "in", "(cancelled,no_show)");

    if (fromParam) {
      bookingServicesQuery = bookingServicesQuery.gte("bookings.scheduled_at", new Date(fromParam).toISOString());
    }
    if (toParam) {
      bookingServicesQuery = bookingServicesQuery.lte("bookings.scheduled_at", new Date(toParam).toISOString());
    }
    if (locationId) {
      bookingServicesQuery = bookingServicesQuery.eq("bookings.location_id", locationId);
    }

    const { data: bookingServices, error: bsError } = await bookingServicesQuery;

    if (bsError) {
      console.error("Error fetching booking services:", bsError);
      return handleApiError(
        new Error(`Failed to fetch services: ${bsError.message}`),
        "FETCH_ERROR",
        500,
      );
    }

    const serviceMap = new Map<
      string,
      { service_name: string; bookingIds: Set<string>; total_revenue: number }
    >();

    (bookingServices || []).forEach((bs: any) => {
      const name = bs.offerings?.title || "Unknown Service";
      const bRow = Array.isArray(bs.bookings) ? bs.bookings[0] : bs.bookings;
      const bookingId = bRow?.id as string | undefined;
      const existing = serviceMap.get(name) || {
        service_name: name,
        bookingIds: new Set<string>(),
        total_revenue: 0,
      };
      if (bookingId) existing.bookingIds.add(bookingId);
      existing.total_revenue += Number(bs.price || 0);
      serviceMap.set(name, existing);
    });

    const result = Array.from(serviceMap.values())
      .map((row) => ({
        service_name: row.service_name,
        booking_count: row.bookingIds.size,
        total_revenue: row.total_revenue,
      }))
      .sort((a, b) => b.booking_count - a.booking_count)
      .slice(0, limit);

    return successResponse(result);
  } catch (error) {
    console.error("Error in top-services report:", error);
    return handleApiError(error, "Failed to generate top services report");
  }
}
