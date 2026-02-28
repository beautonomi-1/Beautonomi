import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError, getPaginationParams, createPaginatedResponse } from "@/lib/supabase/api-helpers";
import type { Booking, PaginatedResponse } from "@/types/beautonomi";
import { mapStatusFromCustomer, mapStatusToCustomer } from "@/lib/utils/booking-status";

/**
 * GET /api/me/bookings
 * 
 * Get current user's bookings
 */
export async function GET(request: NextRequest) {
  try {
    // Require customer role (or provider/admin who can also be customers)
    let user;
    try {
      const authResult = await requireRoleInApi(['customer', 'provider_owner', 'provider_staff', 'superadmin'], request);
      user = authResult.user;
    } catch (authError) {
      console.error("Auth error in bookings API:", authError);
      return handleApiError(authError, "Authentication failed");
    }

    const supabase = await getSupabaseServer();
    const { searchParams } = new URL(request.url);

    const status = searchParams.get("status");
    const { page, limit, offset } = getPaginationParams(request);
    
    console.log("Bookings API called:", { status, page, limit, offset, userId: user.id });

    // Start with a basic query (include version for conflict detection and booking_services)
    let query = supabase
      .from("bookings")
      .select(`
        *,
        version,
        provider:providers (
          id,
          business_name,
          slug
        ),
        group_bookings (
          ref_number
        ),
        booking_services (
          id,
          offering_id,
          staff_id,
          duration_minutes,
          price,
          guest_name,
          offering:offerings (
            id,
            title,
            duration_minutes,
            price
          ),
          staff:provider_staff (
            id,
            name
          )
        ),
        booking_addons (
          id,
          addon_id,
          quantity,
          price,
          offering:offerings (
            id,
            title,
            price
          )
        ),
        booking_products (
          id,
          product_id,
          quantity,
          unit_price,
          total_price,
          products:products!booking_products_product_id_fkey (
            id,
            name,
            retail_price
          )
        )
      `, { count: "exact" })
      .eq("customer_id", user.id);

    // Map frontend status values to database queries using centralized utility
    const now = new Date().toISOString();
    
    // For "past" status, we need to fetch all non-cancelled bookings and filter in memory
    // because we need to match: (status = 'completed' OR scheduled_at < now)
    const needsInMemoryFilter = status === "past";
    
    // Apply status filters using centralized mapping
    if (status === "upcoming") {
      // Upcoming: pending, confirmed, or in_progress bookings scheduled in the future
      const dbStatuses = mapStatusFromCustomer("upcoming");
      query = query
        .in("status", dbStatuses)
        .gte("scheduled_at", now);
    } else if (status === "past") {
      // Past: fetch all non-cancelled bookings, we'll filter in memory
      query = query.neq("status", "cancelled");
    } else if (status === "cancelled") {
      // Cancelled: only cancelled bookings
      query = query.eq("status", "cancelled");
    } else if (status) {
      // If a specific status is provided, use it directly
      query = query.eq("status", status);
    }
    
    // Add ordering
    query = query.order("scheduled_at", { ascending: false });

    // For "past" status, fetch all matching records first to get accurate count
    let allBookings: any[] = [];
    let totalCount = 0;
    
    if (needsInMemoryFilter) {
      // Fetch all bookings without pagination to filter properly
      try {
        const { data: allData, error: allError, count: allCount } = await query;
        if (allError) {
          console.error("Bookings query error (all):", {
            error: allError,
            message: allError.message,
            details: allError.details,
            hint: allError.hint,
            code: allError.code,
          });
          // Return empty results for any query error
          allBookings = [];
          totalCount = 0;
        } else {
          allBookings = allData || [];
          totalCount = allCount || 0;
        }
      } catch (queryException) {
        console.error("Exception during bookings query (all):", queryException);
        allBookings = [];
        totalCount = 0;
      }
    } else {
      // For other statuses, use pagination
      try {
        const { data, error, count } = await query.range(offset, offset + limit - 1);
        if (error) {
          console.error("Bookings query error:", {
            error,
            message: error.message,
            details: error.details,
            hint: error.hint,
            code: error.code,
          });
          // For any query error when there might be no bookings, return empty results
          // This handles RLS issues, missing tables, etc. gracefully
          allBookings = [];
          totalCount = 0;
        } else {
          allBookings = data || [];
          totalCount = count || 0;
        }
      } catch (queryError) {
        console.error("Exception during bookings query:", queryError);
        // Return empty results instead of failing
        allBookings = [];
        totalCount = 0;
      }
    }

    // Filter "past" bookings in memory
    let filteredBookings = allBookings;
    if (needsInMemoryFilter) {
      filteredBookings = allBookings.filter(
        (booking) =>
          booking.status === "completed" ||
          (booking.scheduled_at && new Date(booking.scheduled_at) < new Date(now))
      );
      totalCount = filteredBookings.length;
      
      // Apply pagination after filtering
      filteredBookings = filteredBookings.slice(offset, offset + limit);
    }

    // Transform bookings to match Booking interface
    const transformedBookings = (filteredBookings || []).map((booking: any) => {
      // Keep database status for consistency, add customer status for display
      const customerStatus = mapStatusToCustomer(booking.status, booking.scheduled_at);
      
      // Transform booking_services to BookingServiceDetail format
      const services = (booking.booking_services || []).map((bs: any) => ({
        id: bs.id,
        offering_id: bs.offering_id,
        offering_name: bs.offering?.title || "Service",
        staff_id: bs.staff_id,
        staff_name: bs.staff?.name || null,
        duration_minutes: bs.duration_minutes || bs.offering?.duration_minutes || 0,
        price: bs.price || bs.offering?.price || 0,
        guest_name: bs.guest_name || undefined,
      }));

      // Transform booking_addons to BookingAddon format
      const addons = (booking.booking_addons || []).map((ba: any) => ({
        id: ba.id,
        offering_id: ba.addon_id, // Note: addon_id references offerings table
        offering_name: ba.offering?.title || "Addon",
        price: ba.price || ba.offering?.price || 0,
      }));

      // Transform booking_products
      const products = (booking.booking_products || []).map((bp: any) => ({
        id: bp.id,
        product_id: bp.product_id,
        product_name: bp.products?.name || "Product",
        quantity: bp.quantity || 1,
        unit_price: bp.unit_price || bp.products?.retail_price || 0,
        total_price: bp.total_price || (bp.unit_price || bp.products?.retail_price || 0) * (bp.quantity || 1),
      }));

      // Transform address if it exists
      const address = booking.location_type === "at_home" && booking.address_line1 ? {
        line1: booking.address_line1 || "",
        line2: booking.address_line2 || undefined,
        city: booking.address_city || "",
        state: booking.address_state || undefined,
        country: booking.address_country || "",
        postal_code: booking.address_postal_code || undefined,
        latitude: booking.address_latitude || undefined,
        longitude: booking.address_longitude || undefined,
      } : null;

      return {
        ...booking,
        // Keep database status for consistency, add customer status for display
        status: booking.status, // Database status (pending, confirmed, etc.)
        customer_status: customerStatus, // Customer portal status (upcoming, past, cancelled)
        provider_name: booking.provider?.business_name || "Provider",
        provider_slug: booking.provider?.slug || null,
        is_group_booking: !!booking.group_booking_id,
        group_booking_ref: booking.group_bookings?.ref_number ?? null,
        services,
        addons,
        products,
        address,
        // Ensure all required fields are present
        subtotal: booking.subtotal || 0,
        tip_amount: booking.tip_amount || 0,
        discount_amount: booking.discount_amount || 0,
        total_amount: booking.total_amount || 0,
        currency: booking.currency || "ZAR",
        payment_status: booking.payment_status || "pending",
        loyalty_points_earned: booking.loyalty_points_earned || 0,
        loyalty_points_used: booking.loyalty_points_used || 0,
      };
    });

    const result: PaginatedResponse<Booking> = createPaginatedResponse(
      transformedBookings as Booking[],
      totalCount,
      page,
      limit
    );

    console.log("Bookings API success:", { 
      status, 
      returnedCount: filteredBookings.length, 
      totalCount 
    });

    return successResponse(result);
  } catch (error) {
    console.error("Bookings API error details:", {
      error,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    
    // Return empty results instead of error to prevent 500
    // This allows the UI to show "no bookings" instead of an error
    const emptyResult: PaginatedResponse<Booking> = createPaginatedResponse(
      [] as Booking[],
      0,
      1,
      20
    );
    
    return successResponse(emptyResult);
  }
}
