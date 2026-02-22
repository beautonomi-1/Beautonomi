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


    const { data: providerData, error: providerError } = await supabaseAdmin
      .from("providers")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (providerError || !providerData?.id) {
      return handleApiError(
        new Error("Provider profile not found."),
        "NOT_FOUND",
        404,
      );
    }
    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "5", 10), 20);

    const { data: bookingServices, error: bsError } = await supabaseAdmin
      .from("booking_services")
      .select(
        `
        id,
        price,
        offering_id,
        bookings!inner (id, provider_id, status),
        offerings:offering_id (title)
      `,
      )
      .eq("bookings.provider_id", providerId)
      .not("bookings.status", "in", "(cancelled,no_show)");

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
      { service_name: string; booking_count: number; total_revenue: number }
    >();

    (bookingServices || []).forEach((bs: any) => {
      const name = bs.offerings?.title || "Unknown Service";
      const existing = serviceMap.get(name) || {
        service_name: name,
        booking_count: 0,
        total_revenue: 0,
      };
      existing.booking_count += 1;
      existing.total_revenue += Number(bs.price || 0);
      serviceMap.set(name, existing);
    });

    const result = Array.from(serviceMap.values())
      .sort((a, b) => b.booking_count - a.booking_count)
      .slice(0, limit);

    return successResponse(result);
  } catch (error) {
    console.error("Error in top-services report:", error);
    return handleApiError(error, "Failed to generate top services report");
  }
}
