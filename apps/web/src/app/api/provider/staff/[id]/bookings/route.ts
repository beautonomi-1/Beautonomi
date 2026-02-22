import { NextRequest } from "next/server";
import {  requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError  } from "@/lib/supabase/api-helpers";
import { createClient } from "@supabase/supabase-js";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff", "superadmin"], request);

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const providerId = await getProviderIdForUser(user.id, supabaseAdmin);
    if (!providerId) return notFoundResponse("Provider not found");
    const sp = request.nextUrl.searchParams;
    const limit = Math.min(parseInt(sp.get("limit") || "10", 10), 50);

    const { data: bookingServiceIds } = await supabaseAdmin
      .from("booking_services")
      .select("booking_id")
      .eq("staff_id", params.id);

    const bookingIds = [...new Set((bookingServiceIds || []).map((bs: any) => bs.booking_id))];

    if (bookingIds.length === 0) {
      return successResponse([]);
    }

    const { data: bookings } = await supabaseAdmin
      .from("bookings")
      .select(`
        id, booking_number, status, scheduled_at, total_amount, currency,
        customers:customer_id(full_name),
        booking_services(offerings:offering_id(title))
      `)
      .eq("provider_id", providerId)
      .in("id", bookingIds)
      .order("scheduled_at", { ascending: false })
      .limit(limit);

    const result = (bookings || []).map((b: any) => ({
      id: b.id,
      booking_number: b.booking_number,
      status: b.status,
      scheduled_at: b.scheduled_at,
      customer_name: b.customers?.full_name || "Walk-in",
      service_names: (b.booking_services || []).map((bs: any) => bs.offerings?.title || "Service").filter(Boolean),
      total_amount: Number(b.total_amount || 0),
      currency: b.currency || "ZAR",
    }));

    return successResponse(result);
  } catch (error) {
    return handleApiError(error, "Failed to load staff bookings");
  }
}
