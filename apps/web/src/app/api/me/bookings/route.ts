import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRoleInApi, successResponse, handleApiError, getPaginationParams, createPaginatedResponse } from "@/lib/supabase/api-helpers";
import type { Booking, PaginatedResponse } from "@/types/beautonomi";
import { mapStatusFromCustomer, mapStatusToCustomer } from "@/lib/utils/booking-status";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";

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

    // Service-role read scoped to this user — avoids RLS/embed edge cases (e.g. inactive providers)
    // that return zero rows with the anon JWT client even when bookings exist.
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveTenantIdWithZaFallback(request);
    const tenantRegion = await getTenantRegionConfig(tenantId);
    const lastResortCurrency = tenantRegion?.defaultCurrency ?? LAST_RESORT_CURRENCY;
    const { searchParams } = new URL(request.url);

    const status = searchParams.get("status");
    const { page, limit, offset } = getPaginationParams(request);

    // §Launch-audit 2026-04: default remains scheduled_at desc (newest
    // appointment first). `sort_by=created_at` surfaces bookings by when
    // they were placed — parity with provider lists and ops triage.
    const sortByRaw = (searchParams.get("sort_by") ?? "scheduled_at").trim().toLowerCase();
    const sortDirRaw = (searchParams.get("sort_dir") ?? "desc").trim().toLowerCase();
    const sortBy =
      sortByRaw === "created_at" || sortByRaw === "scheduled_at" ? sortByRaw : "scheduled_at";
    const sortAscending = sortDirRaw === "asc";

    console.log("Bookings API called:", { status, page, limit, offset, userId: user.id, sortBy, sortAscending });

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
        group_bookings!bookings_group_booking_id_fkey (
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
          price
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
    
    // Apply status filters using centralized mapping
    if (status === "upcoming") {
      // Upcoming: pending / confirmed / in_progress. Must include in_progress even when
      // scheduled_at is already in the past (service started — same row the provider marked started).
      const dbStatuses = mapStatusFromCustomer("upcoming");
      const nowQuoted = `"${now}"`;
      query = query
        .in("status", dbStatuses)
        .or(`scheduled_at.gte.${nowQuoted},status.eq.in_progress`);
    } else if (status === "past") {
      // Past is now fully database-filtered so high-volume customers do not
      // force the API to load their entire history before slicing.
      const nowQuoted = `"${now}"`;
      query = query
        .neq("status", "cancelled")
        .neq("status", "in_progress")
        .or(`status.eq.completed,scheduled_at.lt.${nowQuoted}`);
    } else if (status === "cancelled") {
      // Cancelled: only cancelled bookings
      query = query.eq("status", "cancelled");
    } else if (status) {
      // If a specific status is provided, use it directly
      query = query.eq("status", status);
    }
    
    // Ordering (see sortBy / sortAscending above)
    query = query.order(sortBy, { ascending: sortAscending });

    const { data, error, count } = await query.range(offset, offset + limit - 1);
    if (error) {
      console.error("Bookings query error:", {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
      throw error;
    }
    const filteredBookings = data || [];
    const totalCount = count || 0;

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
        offering_id: ba.addon_id,
        offering_name: ba.addon_name || "Add-on",
        price: ba.price || 0,
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
        currency: booking.currency || lastResortCurrency,
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
    return handleApiError(error, "Failed to load bookings");
  }
}
