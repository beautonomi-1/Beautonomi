import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import type { Booking } from "@/types/beautonomi";
import { mapStatusToProvider, mapStatusFromProvider } from "@/lib/utils/booking-status";

// Map frontend status to database enum values
function mapStatusToDatabase(frontendStatus: string): string {
  return mapStatusFromProvider(frontendStatus as any);
}

// Map database status to frontend status
function mapStatusFromDatabase(dbStatus: string): string {
  return mapStatusToProvider(dbStatus as any);
}

/**
 * GET /api/provider/bookings/[id]
 * 
 * Get a specific booking for provider
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return notFoundResponse("Booking ID is required");
    }

    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);

    const supabase = await getSupabaseServer(request);
    const supabaseAdmin = getSupabaseAdmin();

    // Get provider ID
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      console.warn("[GET /api/provider/bookings/[id]] Provider not found for user", user.id);
      return notFoundResponse("Provider not found");
    }

    // Use admin client for the booking read (same as GET list) so RLS doesn't block
    // provider portal reads; we already scope by provider_id.
    // Match list endpoint: use explicit FK for group_bookings and same relation shape.
    const { data: booking, error } = await supabaseAdmin
      .from("bookings")
      .select(
        `
        *,
        version,
        customers:users!bookings_customer_id_fkey(id, full_name, email, phone),
        locations:provider_locations(id, name, address_line1, city),
        group_bookings!bookings_group_booking_id_fkey(ref_number, booking_participants(id, participant_name, participant_email, participant_phone, is_primary_contact)),
        booking_services(
          id,
          offering_id,
          staff_id,
          duration_minutes,
          price,
          scheduled_start_at,
          scheduled_end_at,
          guest_name,
          offerings:offerings!booking_services_offering_id_fkey(id, title),
          staff:provider_staff(id, name, role)
        ),
        booking_products(
          id,
          product_id,
          quantity,
          unit_price,
          total_price,
          products:products!booking_products_product_id_fkey(id, name, retail_price)
        )
      `
      )
      .eq("id", id)
      .eq("provider_id", providerId)
      .maybeSingle();

    if (error || !booking) {
      console.warn("[GET /api/provider/bookings/[id]] Booking not found", { id, providerId, supabaseError: error?.message ?? null });
      return notFoundResponse("Booking not found");
    }

    // Transform to match Booking type
    const bookingData = booking as any;
    const transformedBooking: Booking = {
      id: bookingData.id,
      booking_number: bookingData.booking_number,
      customer_id: bookingData.customer_id,
      provider_id: bookingData.provider_id,
      status: mapStatusFromDatabase(bookingData.status),
      location_type: bookingData.location_type,
      location_id: bookingData.location_id,
      // Construct address object from individual columns (including house call specific fields)
      address: bookingData.address_line1 ? {
        line1: bookingData.address_line1,
        line2: bookingData.address_line2,
        city: bookingData.address_city,
        state: bookingData.address_state,
        country: bookingData.address_country,
        postal_code: bookingData.address_postal_code,
        latitude: bookingData.address_latitude,
        longitude: bookingData.address_longitude,
        // House call specific fields
        apartment_unit: bookingData.apartment_unit,
        building_name: bookingData.building_name,
        floor_number: bookingData.floor_number,
        access_codes: bookingData.access_codes ? (typeof bookingData.access_codes === 'string' ? JSON.parse(bookingData.access_codes) : bookingData.access_codes) : null,
        parking_instructions: bookingData.parking_instructions,
        location_landmarks: bookingData.location_landmarks,
      } : null,
      // House call instructions (separate from special_requests)
      house_call_instructions: bookingData.house_call_instructions || null,
      scheduled_at: bookingData.scheduled_at,
      completed_at: bookingData.completed_at || null,
      cancelled_at: bookingData.cancelled_at || null,
      cancellation_reason: bookingData.cancellation_reason || null,
      // Services are fetched via booking_services join (include guest_name for group bookings)
      services: (bookingData.booking_services || []).map((bs: any) => ({
        id: bs.id,
        offering_id: bs.offering_id,
        service_id: bs.offering_id,
        offering_name: bs.offerings?.title || "Unknown Service",
        service_name: bs.offerings?.title || "Unknown Service",
        staff_id: bs.staff_id,
        staff_name: bs.staff?.name,
        staff: bs.staff,
        duration_minutes: bs.duration_minutes,
        price: bs.price,
        scheduled_start_at: bs.scheduled_start_at,
        scheduled_end_at: bs.scheduled_end_at,
        guest_name: bs.guest_name || null,
        customization: null,
      })),
      products: (bookingData.booking_products || []).map((bp: any) => ({
        id: bp.id,
        product_id: bp.product_id,
        product_name: bp.products?.name || "Unknown Product",
        quantity: bp.quantity,
        unit_price: bp.unit_price,
        total_price: bp.total_price,
      })),
      addons: [], // Would need separate fetch from booking_addons
      package_id: bookingData.package_id || null,
      subtotal: bookingData.subtotal || 0,
      discount_amount: bookingData.discount_amount || 0,
      discount_code: bookingData.discount_code || null,
      discount_reason: bookingData.discount_reason || null,
      tax_amount: bookingData.tax_amount || 0,
      tax_rate: bookingData.tax_rate || 0,
      service_fee_percentage: bookingData.service_fee_percentage || 0,
      service_fee_amount: bookingData.service_fee_amount || 0,
      tip_amount: bookingData.tip_amount || 0,
      travel_fee_amount: bookingData.travel_fee || 0,
      total_amount: bookingData.total_amount || 0,
      total_paid: bookingData.total_paid || 0,
      total_refunded: bookingData.total_refunded || 0,
      currency: bookingData.currency || "ZAR",
      payment_status: bookingData.payment_status,
      payment_method: null, // payment_method_id is the actual column
      special_requests: bookingData.special_requests || null,
      loyalty_points_earned: bookingData.loyalty_points_earned || 0,
      current_stage: bookingData.current_stage || null,
      created_at: bookingData.created_at,
      updated_at: bookingData.updated_at,
      version: bookingData.version || 0,
      referral_source_id: bookingData.referral_source_id || null,
      provider_form_responses: bookingData.provider_form_responses || null,
      // Include joined data for provider portal (customers, locations)
      customers: bookingData.customers || null,
      locations: bookingData.locations || null,
      // Group booking: for calendar/sidebar (ref + participants). FK join can return array or single.
      is_group_booking: Boolean(bookingData.is_group_booking),
      group_booking_id: bookingData.group_booking_id || null,
      group_booking_ref: (() => {
        const gb = bookingData.group_bookings;
        const one = Array.isArray(gb) ? gb[0] : gb;
        return one?.ref_number ?? null;
      })(),
      participants: (() => {
        const gb = bookingData.group_bookings;
        const one = Array.isArray(gb) ? gb[0] : gb;
        return (one?.booking_participants || []).map((p: any) => ({
          id: p.id,
          participant_name: p.participant_name,
          participant_email: p.participant_email,
          participant_phone: p.participant_phone,
          is_primary_contact: p.is_primary_contact,
        }));
      })(),
    } as Booking & { version: number; is_group_booking?: boolean; group_booking_id?: string | null; group_booking_ref?: string | null; participants?: any[] };

    // Load booking custom field values (provider can read their bookings' values via RLS)
    const { data: valueRows } = await supabase
      .from("custom_field_values")
      .select("custom_field_id, value")
      .eq("entity_type", "booking")
      .eq("entity_id", id);
    if (valueRows && valueRows.length > 0) {
      const { data: fieldDefs } = await supabase
        .from("custom_fields")
        .select("id, name, field_type")
        .eq("entity_type", "booking")
        .in("id", valueRows.map((r) => r.custom_field_id));
      const idToName = new Map((fieldDefs || []).map((f) => [f.id, f.name]));
      const idToType = new Map((fieldDefs || []).map((f) => [f.id, f.field_type]));
      const customFieldValues: Record<string, string | number | boolean | null> = {};
      for (const r of valueRows) {
        const name = idToName.get(r.custom_field_id);
        if (!name) continue;
        const fieldType = idToType.get(r.custom_field_id) || "text";
        let val: string | number | boolean | null = r.value;
        if (fieldType === "number") val = r.value != null ? Number(r.value) : null;
        else if (fieldType === "checkbox") val = r.value === "true" || r.value === "1";
        else if (r.value === undefined) val = null;
        customFieldValues[name] = val as string | number | boolean | null;
      }
      (transformedBooking as any).custom_field_values = customFieldValues;
    }

    return successResponse(transformedBooking);
  } catch (error) {
    return handleApiError(error, "Failed to fetch booking");
  }
}

/**
 * PATCH /api/provider/bookings/[id]
 * 
 * Update booking status (confirm, cancel, complete)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Check permission to edit appointments
    const permissionCheck = await requirePermission('edit_appointments', request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;

    const supabase = await getSupabaseServer(request);
    const { id } = await params;
    const body = await request.json();
    const { status } = body;

    // Status is not required if we're updating other fields
    const { 
      scheduled_at, 
      staff_id, 
      special_requests,
      // Additional editable fields for full Mangomint-style editing
      duration_minutes: _duration_minutes,
      subtotal,
      total_amount,
      tip_amount,
      discount_amount,
      discount_code,
      discount_reason,
      tax_amount,
      // Note: service_customization is stored in booking_services.customization, not bookings table
      cancellation_reason,
      cancellation_fee,
      // Location and address fields
      location_type,
      location_id,
      address_line1,
      address_line2,
      address_city,
      address_state,
      address_postal_code,
      travel_fee,
      // Multiple services and products
      services,
      products,
      // Client arrived (in-salon check-in) - stores WAITING state
      current_stage,
      send_arrival_notification,
      referral_source_id,
    } = body;
    
    // Check if any updateable field is provided
    // Note: duration_minutes is stored in booking_services, not bookings table
    const hasUpdates = status || scheduled_at || staff_id || special_requests !== undefined ||
        subtotal !== undefined || 
        total_amount !== undefined || tip_amount !== undefined ||
        discount_amount !== undefined || discount_reason !== undefined ||
        tax_amount !== undefined ||
        location_type || location_id || address_line1 || travel_fee !== undefined ||
        services !== undefined || products !== undefined ||
        current_stage !== undefined ||
        referral_source_id !== undefined;
        
    if (!hasUpdates) {
      return errorResponse("At least one field to update is required", "VALIDATION_ERROR", 400);
    }

    // Get provider ID
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    // Verify booking belongs to provider
    const { data: booking } = await supabase
      .from("bookings")
      .select("id")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (!booking) {
      return notFoundResponse("Booking not found");
    }

    // Get current booking to check status transition and conflict detection
    const { data: currentBooking } = await supabase
      .from("bookings")
      .select("*")
      .eq("id", id)
      .single();

    if (!currentBooking) {
      return notFoundResponse("Booking not found");
    }

    // Conflict detection: Check if booking was modified by another user
    const { version, updated_at } = body;
    if (version !== undefined) {
      // Using version number for optimistic locking
      const currentVersion = (currentBooking as any).version || 0;
      if (version !== currentVersion) {
        return errorResponse(
          "This booking was modified by another user. Please refresh and try again.",
          "CONFLICT",
          409
        );
      }
    } else if (updated_at) {
      // Alternative: Using updated_at timestamp for conflict detection
      const currentUpdatedAt = new Date((currentBooking as any).updated_at).getTime();
      const providedUpdatedAt = new Date(updated_at).getTime();
      if (Math.abs(currentUpdatedAt - providedUpdatedAt) > 1000) {
        // More than 1 second difference indicates a conflict
        return errorResponse(
          "This booking was modified by another user. Please refresh and try again.",
          "CONFLICT",
          409
        );
      }
    }

    // Update booking
    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    // Update status if provided (map frontend status to database status)
    if (status) {
      updateData.status = mapStatusToDatabase(status);
    }

    // Update current_stage (e.g. client_arrived for in-salon check-in, or null when starting service)
    if (current_stage !== undefined) {
      const locationType = (currentBooking as any)?.location_type;
      // client_arrived only applies to at-salon; at-home uses provider_on_way/provider_arrived
      if (current_stage === "client_arrived" && locationType === "at_home") {
        // Ignore: house calls don't have "client arrived" concept
      } else {
        updateData.current_stage = current_stage === null || current_stage === "" ? null : current_stage;
      }
    }

    // Update scheduled_at if provided (for reschedule)
    if (scheduled_at) {
      updateData.scheduled_at = scheduled_at;
    }

    // Update special_requests/notes if provided
    if (special_requests !== undefined) {
      updateData.special_requests = special_requests;
    }

    // Note: duration_minutes is stored in booking_services table, not bookings table
    // To update duration, update the booking_services records via the services array

    // Update pricing fields if provided
    if (subtotal !== undefined) {
      updateData.subtotal = subtotal;
    }
    if (total_amount !== undefined) {
      updateData.total_amount = total_amount;
    }
    if (tip_amount !== undefined) {
      updateData.tip_amount = tip_amount;
    }
    if (discount_amount !== undefined) {
      updateData.discount_amount = discount_amount;
    }
    if (discount_code !== undefined) {
      updateData.discount_code = discount_code;
    }
    if (discount_reason !== undefined) {
      updateData.discount_reason = discount_reason;
    }
    if (tax_amount !== undefined) {
      updateData.tax_amount = tax_amount;
    }
    if (body.tax_rate !== undefined) {
      updateData.tax_rate = body.tax_rate;
    }
    if (body.service_fee_percentage !== undefined) {
      updateData.service_fee_percentage = body.service_fee_percentage;
    }
    if (body.service_fee_amount !== undefined) {
      updateData.service_fee_amount = body.service_fee_amount;
    }
    if (body.service_fee_paid_by !== undefined) {
      updateData.service_fee_paid_by = body.service_fee_paid_by;
    }

    // Note: service_customization is stored in booking_services.customization, not bookings table
    // To update customization, update the booking_services records via the services array

    // Update cancellation reason if provided (for cancellations)
    if (cancellation_reason !== undefined) {
      updateData.cancellation_reason = cancellation_reason;
    }
    
    // Update cancellation fee if provided
    if (cancellation_fee !== undefined) {
      updateData.cancellation_fee = cancellation_fee;
    }
    
    // Update location type if provided
    if (location_type !== undefined) {
      updateData.location_type = location_type;
    }
    
    // Update location ID if provided
    if (location_id !== undefined) {
      updateData.location_id = location_id;
    }
    
    // Update address fields if provided (for at-home appointments)
    if (address_line1 !== undefined) {
      updateData.address_line1 = address_line1;
    }
    if (address_line2 !== undefined) {
      updateData.address_line2 = address_line2;
    }
    if (address_city !== undefined) {
      updateData.address_city = address_city;
    }
    if (address_state !== undefined) {
      updateData.address_state = address_state;
    }
    if (address_postal_code !== undefined) {
      updateData.address_postal_code = address_postal_code;
    }
    
    // Update travel fee if provided
    if (travel_fee !== undefined) {
      updateData.travel_fee = travel_fee;
    }

    // Update referral source if provided (must belong to this provider)
    if (referral_source_id !== undefined) {
      if (referral_source_id === null || referral_source_id === "") {
        updateData.referral_source_id = null;
      } else {
        const { data: src } = await supabase
          .from("referral_sources")
          .select("id")
          .eq("id", referral_source_id)
          .eq("provider_id", providerId)
          .eq("is_active", true)
          .maybeSingle();
        if (src) updateData.referral_source_id = referral_source_id;
        // If invalid, leave existing value (don't overwrite)
      }
    }

    // Increment version for optimistic locking
    const currentVersion = (currentBooking as any).version || 0;
    updateData.version = currentVersion + 1;

    // Update current_stage for at-home bookings
    // Use the mapped database status for the check
    const dbStatus = updateData.status;
    const locationType = (currentBooking as any)?.location_type;
    
    if (dbStatus && locationType === "at_home") {
      // At-home bookings have additional stages
      if (dbStatus === "confirmed") {
        updateData.current_stage = "confirmed";
      } else if (dbStatus === "in_progress") {
        // If service is starting, set stage to service_started
        // (provider should have already arrived via start-journey/arrive endpoints)
        updateData.current_stage = "service_started";
      } else if (dbStatus === "completed") {
        updateData.current_stage = "service_completed";
        updateData.completed_at = new Date().toISOString();
      } else if (dbStatus === "cancelled") {
        // Clear current_stage on cancellation
        updateData.current_stage = null;
        updateData.cancelled_at = new Date().toISOString();
      }
    } else if (dbStatus && locationType === "at_salon") {
      // Walk-in/salon bookings don't use current_stage, but we should handle completed_at
      if (dbStatus === "completed") {
        updateData.completed_at = new Date().toISOString();
      } else if (dbStatus === "cancelled") {
        updateData.cancelled_at = new Date().toISOString();
      }
    }

    const { error: updateError } = await (supabase
      .from("bookings") as any)
      .update(updateData)
      .eq("id", id);

    if (updateError) {
      throw updateError;
    }

    // Send "client arrived" notification if requested (in-salon only, server-side)
    if (send_arrival_notification && updateData.current_stage === "client_arrived") {
      try {
        const { notifyCustomerArrivedSalon } = await import("@/lib/notifications/notification-service");
        await notifyCustomerArrivedSalon(id);
      } catch (e) {
        console.warn("Customer arrived notification failed:", e);
      }
    }

    // Refetch booking with all joins to include staff names, services, products
    // Note: staff is accessed via booking_services.staff, not directly from bookings
    const { data: initialBooking, error: fetchError } = await supabase
      .from("bookings")
      .select(
        `
        *,
        version,
        customers:users!bookings_customer_id_fkey(id, full_name, email, phone),
        locations:provider_locations(id, name, address_line1, city),
        booking_services(
          id,
          offering_id,
          staff_id,
          duration_minutes,
          price,
          scheduled_start_at,
          offerings:offerings!booking_services_offering_id_fkey(id, title),
          staff:provider_staff(id, name, role)
        ),
        booking_products(
          id,
          product_id,
          quantity,
          unit_price,
          total_price,
          products:products!booking_products_product_id_fkey(id, name, retail_price)
        )
      `
      )
      .eq("id", id)
      .single();

    if (fetchError || !initialBooking) {
      throw fetchError || new Error("Failed to fetch updated booking");
    }

    let updatedBooking: typeof initialBooking = initialBooking;

    // Use admin client for booking_services - bypasses RLS until migration 203 is applied
    const supabaseAdmin = getSupabaseAdmin();

    // Update booking_services if staff_id is changed (for reschedule to different staff)
    // Allow null to unassign staff, so check for undefined instead of truthy
    if (staff_id !== undefined) {
      const bsUpdate: Record<string, unknown> = { staff_id };
      if (scheduled_at) {
        bsUpdate.scheduled_start_at = scheduled_at;
        // Preserve duration: fetch first service's duration and set scheduled_end_at
        const { data: firstBs } = await supabaseAdmin
          .from("booking_services")
          .select("duration_minutes")
          .eq("booking_id", id)
          .limit(1)
          .maybeSingle();
        const duration = firstBs?.duration_minutes ?? 60;
        const start = new Date(scheduled_at);
        bsUpdate.scheduled_end_at = new Date(start.getTime() + duration * 60 * 1000).toISOString();
      }
      const { error: bsError } = await supabaseAdmin
        .from("booking_services")
        .update(bsUpdate)
        .eq("booking_id", id);

      if (bsError) {
        console.error("Error updating booking_services staff:", bsError);
        throw bsError; // Surface error so user sees it instead of false success
      }
      // Refetch so response includes updated staff
      const { data: refetched } = await supabase
        .from("bookings")
        .select(
          `
          *,
          version,
          customers:users!bookings_customer_id_fkey(id, full_name, email, phone),
          locations:provider_locations(id, name, address_line1, city),
          booking_services(
            id,
            offering_id,
            staff_id,
            duration_minutes,
            price,
            scheduled_start_at,
            offerings:offerings!booking_services_offering_id_fkey(id, title),
            staff:provider_staff(id, name, role)
          ),
          booking_products(
            id,
            product_id,
            quantity,
            unit_price,
            total_price,
            products:products!booking_products_product_id_fkey(id, name, retail_price)
          )
        `
        )
        .eq("id", id)
        .single();
      if (refetched) updatedBooking = refetched;
    }

    // Update services if provided
    if (services !== undefined && Array.isArray(services)) {
      // Delete existing services
      await supabaseAdmin
        .from("booking_services")
        .delete()
        .eq("booking_id", id);

      // Insert new services
      if (services.length > 0) {
        const baseScheduledAt = scheduled_at || (currentBooking as any).scheduled_at;
        const servicesToInsert = services.map((service: any) => {
          const startAt = service.scheduled_start_at || baseScheduledAt;
          const duration = service.duration || 60;
          const start = new Date(startAt);
          const end = new Date(start.getTime() + duration * 60 * 1000);
          return {
            booking_id: id,
            offering_id: service.serviceId || service.offering_id,
            staff_id: staff_id ?? (currentBooking as any).staff_id ?? null,
            duration_minutes: duration,
            price: service.price || 0,
            currency: service.currency || "ZAR",
            scheduled_start_at: start.toISOString(),
            scheduled_end_at: end.toISOString(),
          };
        });

        const { error: servicesError } = await supabaseAdmin
          .from("booking_services")
          .insert(servicesToInsert);

        if (servicesError) {
          console.error("Error updating booking_services:", servicesError);
          throw servicesError; // Surface error instead of false success
        }
      }
      // Refetch so response includes new services
      const { data: refetchedServices } = await supabase
        .from("bookings")
        .select(
          `
          *,
          version,
          customers:users!bookings_customer_id_fkey(id, full_name, email, phone),
          locations:provider_locations(id, name, address_line1, city),
          booking_services(
            id,
            offering_id,
            staff_id,
            duration_minutes,
            price,
            scheduled_start_at,
            offerings:offerings!booking_services_offering_id_fkey(id, title),
            staff:provider_staff(id, name, role)
          ),
          booking_products(
            id,
            product_id,
            quantity,
            unit_price,
            total_price,
            products:products!booking_products_product_id_fkey(id, name, retail_price)
          )
        `
        )
        .eq("id", id)
        .single();
      if (refetchedServices) updatedBooking = refetchedServices;
    }

    // Update products if provided
    if (products !== undefined && Array.isArray(products)) {
      // Delete existing products
      await supabase
        .from("booking_products")
        .delete()
        .eq("booking_id", id);

      // Insert new products
      if (products.length > 0) {
        const { data: bookingServices } = await supabase
          .from("booking_services")
          .select("staff_id")
          .eq("booking_id", id)
          .not("staff_id", "is", null)
          .limit(1);
        const primaryStaffId = bookingServices?.[0]?.staff_id ?? null;
        const productsToInsert = products.map((product: any) => ({
          booking_id: id,
          product_id: product.productId,
          quantity: product.quantity || 1,
          unit_price: product.unitPrice || 0,
          total_price: product.totalPrice || (product.unitPrice || 0) * (product.quantity || 1),
          staff_id: primaryStaffId,
        }));

        const { error: productsError } = await supabase
          .from("booking_products")
          .insert(productsToInsert);

        if (productsError) {
          console.error("Error updating booking_products:", productsError);
          // Non-fatal - booking was updated successfully
        }
      }
    }

    // Get customer ID for notifications
    const customerId = (currentBooking as any).customer_id;
    const previousStatus = (currentBooking as any).status;

    // Send notifications for status changes
    if (dbStatus && dbStatus !== previousStatus) {
      try {
        const { sendCancellationNotification, sendRescheduleNotification, sendBookingConfirmationNotification } = await import('@/lib/bookings/notifications');
        
        if (dbStatus === "cancelled") {
          // Reverse loyalty points if they were earned for this booking
          const loyaltyPointsEarned = (currentBooking as any).loyalty_points_earned || 0;
          if (loyaltyPointsEarned > 0 && customerId) {
            try {
              // Check if points were already earned (transaction exists)
              const { data: existingTransaction } = await supabase
                .from("loyalty_point_transactions")
                .select("id, points")
                .eq("reference_id", id)
                .eq("reference_type", "booking")
                .eq("transaction_type", "earned")
                .maybeSingle();

              if (existingTransaction) {
                // Create a reversal transaction to deduct the points
                  await supabase
                    .from("loyalty_point_transactions")
                    .insert({
                      user_id: customerId,
                      transaction_type: "redeemed",
                      points: loyaltyPointsEarned,
                      description: `Points reversed for cancelled booking ${(currentBooking as any).booking_number || id}`,
                      reference_id: id,
                      reference_type: "booking",
                      expires_at: null,
                    });

                console.log(`Reversed ${loyaltyPointsEarned} loyalty points for cancelled booking ${id}`);
              }
            } catch (loyaltyError) {
              // Log but don't fail the cancellation if loyalty reversal fails
              console.error('Failed to reverse loyalty points on cancellation:', loyaltyError);
            }
          }

          // Send cancellation notification
          await sendCancellationNotification(id, {
            cancelledBy: 'provider',
            refundInfo: 'Please contact provider for refund details',
          });
        } else if (dbStatus === "confirmed" && previousStatus === "pending") {
          // Send confirmation notification
          await sendBookingConfirmationNotification(id);
        } else if (scheduled_at && scheduled_at !== (currentBooking as any).scheduled_at) {
          // Send reschedule notification
          await sendRescheduleNotification(
            id,
            new Date((currentBooking as any).scheduled_at),
            new Date(scheduled_at)
          );
        } else if (dbStatus === "completed") {
          // Award customer loyalty points for completed booking
          const subtotal = (currentBooking as any).subtotal || 0;
          
          if (subtotal > 0 && customerId) {
            try {
              const { calculateLoyaltyPoints } = await import("@/lib/loyalty/calculate-points");
              const { data: existingTransaction } = await supabase
                .from("loyalty_point_transactions")
                .select("id")
                .eq("reference_id", id)
                .eq("reference_type", "booking")
                .eq("transaction_type", "earned")
                .maybeSingle();

              if (!existingTransaction) {
                const currency = (currentBooking as any).currency || "ZAR";
                const pointsEarned = await calculateLoyaltyPoints(subtotal, supabase, currency);

                if (pointsEarned > 0) {
                  // Create loyalty transaction for customer
                  const { error: loyaltyError } = await supabase
                    .from("loyalty_point_transactions")
                    .insert({
                      user_id: customerId,
                      transaction_type: "earned",
                      points: pointsEarned,
                      description: `Points earned for completed booking ${(currentBooking as any).booking_number || id}`,
                      reference_id: id,
                      reference_type: "booking",
                      expires_at: null, // Or set expiry based on config
                    });

                  if (!loyaltyError) {
                    // Update booking with loyalty_points_earned
                    await supabase
                      .from("bookings")
                      .update({ loyalty_points_earned: pointsEarned })
                      .eq("id", id);
                      
                    console.log(`Awarded ${pointsEarned} loyalty points to customer for completed booking ${id}`);
                  } else {
                    console.error('Failed to create loyalty transaction:', loyaltyError);
                  }
                }
              }
            } catch (loyaltyError) {
              console.error('Failed to award customer loyalty points on completion:', loyaltyError);
            }
          }
          
          // Completion notification is handled by the database notification system below
          // No additional action needed here
        }
      } catch (notificationError) {
        // Log but don't fail the update if notification fails
        console.error('Failed to send status change notification:', notificationError);
      }
    }

    // Create audit log entry for status change
    const eventTypeMap: Record<string, string> = {
      confirmed: "confirmed",
      in_progress: "service_started",
      completed: "service_completed",
      cancelled: "cancelled",
    };

    const eventType = dbStatus ? eventTypeMap[dbStatus] : null;
    if (eventType) {
      // Create booking event (existing system)
      await supabase
        .from("booking_events")
        .insert({
          booking_id: id,
          event_type: eventType,
          event_data: {
            previous_status: (currentBooking as any)?.status,
            new_status: status,
          },
          created_by: user.id,
        });

      // Create audit log entry (new comprehensive system)
      try {
        const { data: userData } = await supabase
          .from("users")
          .select("full_name, email")
          .eq("id", user.id)
          .single();

        await supabase
          .from("booking_audit_log")
          .insert({
            booking_id: id,
            event_type: "status_changed",
            event_data: {
              previous_status: (currentBooking as any)?.status,
              new_status: status,
              field: "status",
              old_value: (currentBooking as any)?.status,
              new_value: status,
              reason: body.cancellation_reason || null,
            },
            created_by: user.id,
            created_by_name: userData?.full_name || userData?.email || "System",
          });
      } catch (auditError) {
        // Log but don't fail the request if audit logging fails
        console.error("Failed to create audit log entry:", auditError);
      }
    }

    // Notify customer of status change or reschedule
    if (customerId) {
      try {
        // Create database notification
        const bookingNumber = (updatedBooking as any)?.ref_number || (currentBooking as any)?.ref_number || "";
        const previousStatus = (currentBooking as any)?.status;
        const newStatus = dbStatus || previousStatus;
        const wasRescheduled = scheduled_at && scheduled_at !== (currentBooking as any)?.scheduled_at;

        let notificationTitle = "Booking Update";
        let notificationMessage = "";
        let notificationType = "booking_update";

        if (wasRescheduled) {
          notificationTitle = "Booking Rescheduled";
          notificationMessage = `Your booking ${bookingNumber ? `(${bookingNumber}) ` : ""}has been rescheduled.`;
          notificationType = "booking_rescheduled";
        } else if (status && newStatus !== previousStatus) {
          const statusMessages: Record<string, string> = {
            confirmed: "Your booking has been confirmed.",
            in_progress: "Your service has started.",
            completed: "Your service has been completed.",
            cancelled: "Your booking has been cancelled.",
          };
          notificationMessage = statusMessages[newStatus] || `Your booking ${bookingNumber ? `(${bookingNumber}) ` : ""}status has been updated.`;
          notificationType = "booking_status_update";
        } else if (staff_id && staff_id !== (currentBooking as any)?.staff_id) {
          notificationTitle = "Staff Assigned";
          notificationMessage = `A staff member has been assigned to your booking ${bookingNumber ? `(${bookingNumber}) ` : ""}.`;
          notificationType = "booking_staff_changed";
        } else {
          notificationMessage = `Your booking ${bookingNumber ? `(${bookingNumber}) ` : ""}has been updated.`;
        }

        // Insert notification into database
        await supabase.from("notifications").insert({
          user_id: customerId,
          type: notificationType,
          title: notificationTitle,
          message: notificationMessage,
          metadata: {
            booking_id: id,
            booking_number: bookingNumber,
            status: newStatus,
            previous_status: previousStatus,
            was_rescheduled: wasRescheduled,
          },
          link: `/account-settings/bookings/${id}`,
        });

        // Also send push notification via OneSignal using templates
        try {
          const { sendTemplateNotification } = await import("@/lib/notifications/onesignal");
          
          // Get booking details for template variables
          const bookingScheduledAt = (updatedBooking as any)?.scheduled_at || (currentBooking as any)?.scheduled_at;
          const previousScheduledAt = (currentBooking as any)?.scheduled_at;
          
          // Format dates and times
          const formatDate = (dateStr: string | null | undefined) => {
            if (!dateStr) return "";
            return new Date(dateStr).toLocaleDateString();
          };
          
          const formatTime = (dateStr: string | null | undefined) => {
            if (!dateStr) return "";
            return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          };
          
          const scheduledDate = formatDate(bookingScheduledAt);
          const scheduledTime = formatTime(bookingScheduledAt);
          const previousDate = formatDate(previousScheduledAt);
          const previousTime = formatTime(previousScheduledAt);
          
          // Get provider name
          const { data: providerData } = await supabase
            .from("providers")
            .select("business_name")
            .eq("id", providerId)
            .single();
          
          const providerName = providerData?.business_name || "Your provider";
          
          // Map status changes to template keys
          let templateKey: string | null = null;
          let templateVariables: Record<string, string> = {};
          
          if (newStatus === "confirmed" && previousStatus !== "confirmed") {
            templateKey = "booking_confirmed";
            templateVariables = {
              provider_name: providerName,
              booking_date: scheduledDate || "your appointment",
              booking_time: scheduledTime || "",
              services: (updatedBooking as any)?.service_name || (currentBooking as any)?.service_name || "service",
              total_amount: `R${((updatedBooking as any)?.total_amount || (currentBooking as any)?.total_amount || 0).toFixed(2)}`,
              booking_number: bookingNumber || "",
              booking_id: id,
            };
          } else if (newStatus === "cancelled") {
            templateKey = "booking_cancelled";
            templateVariables = {
              provider_name: providerName,
              booking_date: scheduledDate || "your appointment",
              booking_number: bookingNumber || "",
              refund_info: ((updatedBooking as any)?.payment_status || (currentBooking as any)?.payment_status) === "paid" 
                ? "A refund will be processed within 3-5 business days."
                : "No payment was required.",
              booking_id: id,
            };
          } else if (wasRescheduled) {
            templateKey = "booking_rescheduled";
            templateVariables = {
              provider_name: providerName,
              new_date: scheduledDate || "",
              new_time: scheduledTime || "",
              old_date: previousDate || "",
              old_time: previousTime || "",
              booking_id: id,
            };
          } else if (newStatus === "completed") {
            templateKey = "service_completed";
            templateVariables = {
              provider_name: providerName,
              services: (updatedBooking as any)?.service_name || (currentBooking as any)?.service_name || "service",
              booking_id: id,
            };
          }

          // Send notification using template if available
          if (templateKey) {
            await sendTemplateNotification(
              templateKey,
              [customerId],
              templateVariables,
              ["push", "email"]
            );
          }
          // Note: For other status changes without specific templates, notifications are skipped
          // to avoid errors. Add specific notification templates as needed.
        } catch (pushError) {
          // OneSignal might not be configured, that's okay
          console.warn("OneSignal push notification not available:", pushError);
        }
      } catch (notifError) {
        // Log but don't fail the request
        console.error("Error creating customer notification:", notifError);
      }
    }

    // Transform the fetched booking to match Booking type (same as GET endpoint)
    const bookingData = updatedBooking as any;
    const transformedBooking: Booking = {
      id: bookingData.id,
      booking_number: bookingData.booking_number,
      customer_id: bookingData.customer_id,
      provider_id: bookingData.provider_id,
      status: mapStatusFromDatabase(bookingData.status),
      location_type: bookingData.location_type,
      location_id: bookingData.location_id,
      address: bookingData.address_line1 ? {
        line1: bookingData.address_line1,
        line2: bookingData.address_line2,
        city: bookingData.address_city,
        state: bookingData.address_state,
        country: bookingData.address_country,
        postal_code: bookingData.address_postal_code,
        latitude: bookingData.address_latitude,
        longitude: bookingData.address_longitude,
        apartment_unit: bookingData.apartment_unit,
        building_name: bookingData.building_name,
        floor_number: bookingData.floor_number,
        access_codes: bookingData.access_codes,
        parking_instructions: bookingData.parking_instructions,
        location_landmarks: bookingData.location_landmarks,
      } : null,
      house_call_instructions: bookingData.house_call_instructions || null,
      scheduled_at: bookingData.scheduled_at,
      completed_at: bookingData.completed_at || null,
      cancelled_at: bookingData.cancelled_at || null,
      cancellation_reason: bookingData.cancellation_reason || null,
      services: (bookingData.booking_services || []).map((bs: any) => ({
        id: bs.id,
        service_id: bs.offering_id,
        service_name: bs.offerings?.title || "Unknown Service",
        staff_id: bs.staff_id,
        staff_name: bs.staff?.name || null,
        duration_minutes: bs.duration_minutes,
        price: bs.price,
        customization: null,
      })),
      products: (bookingData.booking_products || []).map((bp: any) => ({
        id: bp.id,
        product_id: bp.product_id,
        product_name: bp.products?.name || "Unknown Product",
        quantity: bp.quantity,
        unit_price: bp.unit_price,
        total_price: bp.total_price,
      })),
      addons: [],
      package_id: bookingData.package_id || null,
      subtotal: bookingData.subtotal || 0,
      discount_amount: bookingData.discount_amount || 0,
      discount_code: bookingData.discount_code || null,
      discount_reason: bookingData.discount_reason || null,
      tax_amount: bookingData.tax_amount || 0,
      tax_rate: bookingData.tax_rate || 0,
      service_fee_percentage: bookingData.service_fee_percentage || 0,
      service_fee_amount: bookingData.service_fee_amount || 0,
      tip_amount: bookingData.tip_amount || 0,
      total_amount: bookingData.total_amount || 0,
      total_paid: bookingData.total_paid || 0,
      total_refunded: bookingData.total_refunded || 0,
      currency: bookingData.currency || "ZAR",
      payment_status: bookingData.payment_status,
      payment_method: null,
      special_requests: bookingData.special_requests || null,
      loyalty_points_earned: bookingData.loyalty_points_earned || 0,
      created_at: bookingData.created_at,
      updated_at: bookingData.updated_at,
      version: bookingData.version || 0,
    } as Booking & { version: number };

    return successResponse({ booking: transformedBooking });
  } catch (error) {
    return handleApiError(error, "Failed to update booking");
  }
}
