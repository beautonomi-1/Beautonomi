import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRoleInApi, successResponse, handleApiError, getPaginationParams, createPaginatedResponse } from "@/lib/supabase/api-helpers";
import type { Booking, PaginatedResponse } from "@/types/beautonomi";
import { mapStatusFromCustomer, resolveCustomerListTab } from "@/lib/utils/booking-status";
import {
  enrichBookingLifecycleFields,
  mapProviderSettingsFromRow,
} from "@/lib/bookings/lifecycle-booking-enrichment";
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
          scheduled_end_at,
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
      const dbStatuses = mapStatusFromCustomer("upcoming");
      // Late window can last duration + close-out grace. Keep confirmed leftovers
      // in the fetch set long enough that post-filter by lifecycle_hint can put
      // still-open visits on Upcoming and closed leftovers on Past.
      const upcomingLookback = `"${new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()}"`;
      query = query
        .in("status", dbStatuses)
        .or(
          `status.in.(pending,pending_payment,in_progress,waiting,checked_in),scheduled_at.gte.${upcomingLookback}`,
        );
    } else if (status === "past") {
      const nowQuoted = `"${now}"`;
      query = query.or(
        `status.eq.completed,status.eq.no_show,and(scheduled_at.lt.${nowQuoted},status.in.(confirmed,checked_in,waiting,in_progress))`,
      );
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
    const providerSettingsCache = new Map<string, ReturnType<typeof mapProviderSettingsFromRow>>();

    const providerIds = [
      ...new Set(
        filteredBookings
          .map((b: { provider_id?: string | null }) => b.provider_id)
          .filter(Boolean) as string[],
      ),
    ];

    if (providerIds.length > 0) {
      const { data: providerRows } = await supabase
        .from("providers")
        .select(
          "id, closeout_grace_minutes_salon, closeout_grace_minutes_at_home, late_arrival_grace_minutes, confirmation_sla_hours, unconfirmed_expire_hours_before_slot",
        )
        .in("id", providerIds);
      for (const row of providerRows ?? []) {
        providerSettingsCache.set(
          (row as { id: string }).id,
          mapProviderSettingsFromRow(row as Record<string, unknown>),
        );
      }
    }

    const totalCount = count || 0;

    // Transform bookings to match Booking interface
    let transformedBookings = (filteredBookings || []).map((booking: any) => {
      // Coherence: a row stuck at `status = 'pending_payment'` while
      // `payment_status` is paid/partially_paid is a transient state that the
      // DB trigger now repairs (migration 595), but list responses must still
      // present a coherent view if the trigger has not yet caught up. Map to
      // `pending` (awaiting provider confirmation) so the customer's badge
      // and any client-side filtering stay consistent with the detail page.
      const _ps = (booking.payment_status || "").toLowerCase();
      if (
        booking.status === "pending_payment" &&
        (_ps === "paid" || _ps === "partially_paid")
      ) {
        booking.status = "pending";
      }

      // Keep database status for consistency, add customer status for display
      const lifecycle = enrichBookingLifecycleFields(
        {
          status: booking.status,
          scheduled_at: booking.scheduled_at,
          location_type: booking.location_type,
          current_stage: booking.current_stage,
          booking_services: booking.booking_services,
        },
        providerSettingsCache.get(booking.provider_id) ?? undefined,
      );

      const customerStatus = resolveCustomerListTab({
        status: booking.status,
        scheduledAt: booking.scheduled_at,
        lifecycleHint: lifecycle.lifecycle_hint,
      });
      
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
        lifecycle_hint: lifecycle.lifecycle_hint,
        end_at: lifecycle.end_at,
        close_out_at: lifecycle.close_out_at,
        in_late_window: lifecycle.in_late_window,
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

    if (status === "upcoming") {
      transformedBookings = transformedBookings.filter(
        (b) => b.customer_status === "upcoming",
      );
    } else if (status === "past") {
      transformedBookings = transformedBookings.filter((b) => b.customer_status === "past");
    }

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
