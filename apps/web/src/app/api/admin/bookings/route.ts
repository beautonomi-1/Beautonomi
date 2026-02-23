import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";

/**
 * GET /api/admin/bookings
 *
 * Get all platform bookings with filters. Uses admin client so superadmin sees all bookings.
 */
export async function GET(request: NextRequest) {
  try {
    await requireRoleInApi(['superadmin'], request);

    const supabase = getSupabaseAdmin();
    const { searchParams } = new URL(request.url);

    // Get bookings without joins to avoid join issues
    let query = supabase
      .from("bookings")
      .select("*");

    // Apply filters
    const status = searchParams.get("status");
    if (status && status !== "all") {
      query = query.eq("status", status);
    }

    const date = searchParams.get("date");
    if (date) {
      const startDate = new Date(date);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 1);
      query = query
        .gte("scheduled_at", startDate.toISOString())
        .lt("scheduled_at", endDate.toISOString());
    }

    const { data: bookings, error } = await query
      .order("scheduled_at", { ascending: false });

    if (error) {
      console.error("Error fetching bookings:", error);
      console.error("Query details:", {
        status,
        date,
        errorMessage: error.message,
        errorCode: error.code,
        errorDetails: error.details
      });
      // Return empty array instead of throwing to avoid 500 error
      return successResponse([]);
    }

    // Handle case where no bookings are found
    if (!bookings || bookings.length === 0) {
      return successResponse([]);
    }

    // Fetch related data separately
    const customerIds = [...new Set(bookings.map((b: any) => b.customer_id).filter(Boolean))];
    const providerIds = [...new Set(bookings.map((b: any) => b.provider_id).filter(Boolean))];
    const locationIds = [...new Set(bookings.map((b: any) => b.location_id).filter(Boolean))];

    // Fetch customers
    let customersData: any[] = [];
    if (customerIds.length > 0) {
      try {
        const { data, error: customersError } = await supabase
          .from("users")
          .select("id, full_name, email, phone")
          .in("id", customerIds);
        if (!customersError) {
          customersData = data || [];
        }
      } catch (err) {
        console.error("Error fetching customers:", err);
      }
    }
    const _customersMap = new Map(customersData.map((u: any) => [u.id, u]));
    void _customersMap;

    // Fetch providers
    let providersData: any[] = [];
    if (providerIds.length > 0) {
      try {
        const { data, error: providersError } = await supabase
          .from("providers")
          .select("id, business_name")
          .in("id", providerIds);
        if (!providersError) {
          providersData = data || [];
        }
      } catch (err) {
        console.error("Error fetching providers:", err);
      }
    }
    const _providersMap = new Map(providersData.map((p: any) => [p.id, p]));
    void _providersMap;

    // Fetch locations
    let locationsData: any[] = [];
    if (locationIds.length > 0) {
      try {
        const { data, error: locationsError } = await supabase
          .from("provider_locations")
          .select("id, name, address_line1, city")
          .in("id", locationIds);
        if (!locationsError) {
          locationsData = data || [];
        }
      } catch (err) {
        console.error("Error fetching locations:", err);
      }
    }
    const _locationsMap = new Map(locationsData.map((l: any) => [l.id, l]));
    void _locationsMap;

    // Transform to match Booking type
    const transformedBookings = bookings.map((booking: any) => ({
      id: booking.id,
      booking_number: booking.booking_number,
      customer_id: booking.customer_id,
      provider_id: booking.provider_id,
      status: booking.status,
      location_type: booking.location_type,
      location_id: booking.location_id,
      address: booking.address || null,
      scheduled_at: booking.scheduled_at,
      completed_at: booking.completed_at || null,
      cancelled_at: booking.cancelled_at || null,
      cancellation_reason: booking.cancellation_reason || null,
      services: booking.services || [],
      addons: booking.addons || [],
      package_id: booking.package_id || null,
      subtotal: booking.subtotal || 0,
      tip_amount: booking.tip_amount || 0,
      total_amount: booking.total_amount || 0,
      currency: booking.currency || "ZAR",
      payment_status: booking.payment_status,
      payment_method: booking.payment_method || null,
      special_requests: booking.special_requests || null,
      loyalty_points_earned: booking.loyalty_points_earned || 0,
      created_at: booking.created_at,
      updated_at: booking.updated_at,
    }));

    // Return array directly to match frontend expectations (same as providers)
    return successResponse(transformedBookings);
  } catch (error) {
    return handleApiError(error, "Failed to fetch bookings");
  }
}

