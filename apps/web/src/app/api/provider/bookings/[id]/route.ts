import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";

import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import type { Booking } from "@/types/beautonomi";
import {
  mapStatusToProvider,
  mapStatusFromProvider,
  type BookingStatus,
  type ProviderBookingStatus,
} from "@/lib/utils/booking-status";
import { checkBookingConflict } from "@/lib/bookings/conflict-check";
import { invalidateProviderBookingsReadCache } from "@/lib/bookings/provider-bookings-read-cache";
import { awardPointsForBooking } from "@/lib/services/provider-gamification";
import { assertProviderUserCanAccessBookingBranch } from "@/lib/provider-booking/booking-branch-access";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { getTenantMoneyFormatter } from "@/lib/money/tenant-intl-format";
import { isOTPExpired } from "@/lib/otp/generator";
import { isQRCodeExpired } from "@/lib/qr/generator";

function mapStatusToDatabase(frontendStatus: string): string {
  return mapStatusFromProvider(frontendStatus as ProviderBookingStatus);
}

function mapStatusFromDatabase(dbStatus: string): string {
  return mapStatusToProvider(dbStatus as BookingStatus);
}

function resolveLoyaltyBaseAmount(booking: {
  subtotal?: number | null;
  total_amount?: number | null;
  tax_amount?: number | null;
  service_fee_amount?: number | null;
  tip_amount?: number | null;
  travel_fee?: number | null;
  discount_amount?: number | null;
}): number {
  const subtotal = Number(booking.subtotal ?? 0);
  if (subtotal > 0) return subtotal;

  const total = Number(booking.total_amount ?? 0);
  if (total <= 0) return 0;

  const tax = Number(booking.tax_amount ?? 0);
  const serviceFee = Number(booking.service_fee_amount ?? 0);
  const tip = Number(booking.tip_amount ?? 0);
  const travel = Number(booking.travel_fee ?? 0);
  const discount = Number(booking.discount_amount ?? 0);
  return Math.max(0, total - tax - serviceFee - tip - travel + discount);
}

/** Raw booking row from DB with joined booking_services, booking_products, group_bookings */
type BookingDbRow = Record<string, unknown> & {
  id?: string;
  booking_number?: string;
  customer_id?: string;
  provider_id?: string;
  status?: string;
  location_type?: string;
  location_id?: string;
  address_line1?: string;
  address_line2?: string | null;
  address_city?: string;
  address_state?: string | null;
  address_country?: string;
  address_postal_code?: string | null;
  address_latitude?: number | null;
  address_longitude?: number | null;
  apartment_unit?: string | null;
  building_name?: string | null;
  floor_number?: string | null;
  access_codes?: unknown;
  parking_instructions?: string | null;
  location_landmarks?: string | null;
  house_call_instructions?: string | null;
  scheduled_at?: string;
  completed_at?: string | null;
  cancelled_at?: string | null;
  cancellation_reason?: string | null;
  package_id?: string | null;
  subtotal?: number;
  discount_amount?: number;
  discount_code?: string | null;
  discount_reason?: string | null;
  tax_amount?: number;
  tax_rate?: number;
  service_fee_percentage?: number;
  service_fee_amount?: number;
  tip_amount?: number;
  travel_fee?: number;
  total_amount?: number;
  total_paid?: number;
  total_refunded?: number;
  currency?: string;
  payment_status?: string;
  special_requests?: string | null;
  loyalty_points_earned?: number;
  current_stage?: string | null;
  created_at?: string;
  updated_at?: string;
  version?: number;
  referral_source_id?: string | null;
  provider_form_responses?: Record<string, Record<string, unknown>> | null;
  customers?: unknown;
  locations?: unknown;
  is_group_booking?: boolean;
  group_booking_id?: string | null;
  booking_services?: Array<{
    id: string;
    offering_id?: string;
    staff_id?: string;
    duration_minutes?: number;
    price?: number;
    scheduled_start_at?: string;
    scheduled_end_at?: string;
    guest_name?: string | null;
    offerings?: { title?: string } | Array<{ title?: string }>;
    staff?: { name?: string } | Array<{ name?: string }>;
  }>;
  booking_products?: Array<{
    id: string;
    product_id?: string;
    product_variant_id?: string | null;
    product_variant?: unknown;
    quantity?: number;
    unit_price?: number;
    total_price?: number;
    products?: { name?: string } | Array<{ name?: string }>;
  }>;
  group_bookings?: { ref_number?: string; booking_participants?: Array<{ id?: string; participant_name?: string; participant_email?: string; participant_phone?: string; is_primary_contact?: boolean }> } | Array<{ ref_number?: string; booking_participants?: unknown[] }>;
  service_packages?: { id?: string; name?: string } | Array<{ id?: string; name?: string }>;
};

/** Booking response with optional provider-only fields */
type BookingResponse = Booking & { custom_field_values?: Record<string, string | number | boolean | null>; provider_points_earned?: number | null };

/** Minimal booking row fields read in PATCH (from .select("*")) */
type BookingRow = {
  version?: number;
  updated_at?: string;
  scheduled_at?: string;
  location_type?: string;
  customer_id?: string;
  status?: string;
  booking_number?: string;
  subtotal?: number;
  currency?: string;
  loyalty_points_earned?: number;
  ref_number?: string;
  staff_id?: string;
  total_amount?: number;
  payment_status?: string;
  service_name?: string;
};

/** booking_services row with offerings (for conflict check); Supabase can return offerings as array */
type BookingServiceConflictRow = {
  staff_id?: string;
  scheduled_start_at?: string;
  duration_minutes?: number;
  offerings?: { buffer_minutes?: number } | Array<{ buffer_minutes?: number }>;
};

/** Refetched booking after PATCH (with joins) for notifications/response */
type RefetchedBookingRow = BookingDbRow & {
  ref_number?: string;
  scheduled_at?: string;
  total_amount?: number;
  payment_status?: string;
  service_name?: string;
};

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

    const tenantId = await resolveTenantIdWithZaFallback(request);
    const tenantRegion = await getTenantRegionConfig(tenantId);
    const lastResortCurrency = tenantRegion?.defaultCurrency ?? LAST_RESORT_CURRENCY;

    // Use admin client for the booking read (same as GET list) so RLS doesn't block
    // provider portal reads; we already scope by provider_id.
    // Match list endpoint: use explicit FK for group_bookings and same relation shape.
    const { data: booking, error } = await supabaseAdmin
      .from("bookings")
      .select(
        `
        *,
        version,
        customers:users!bookings_customer_id_fkey(id, full_name, email, phone, rating_average, review_count),
        locations:provider_locations(id, name, address_line1, city),
        group_bookings!bookings_group_booking_id_fkey(ref_number, booking_participants(id, participant_name, participant_email, participant_phone, is_primary_contact)),
        service_packages!bookings_package_id_fkey(id, name),
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
          product_variant_id,
          quantity,
          unit_price,
          total_price,
          products:products!booking_products_product_id_fkey(id, name, retail_price),
          product_variant:product_variants(id, option_values)
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

    const branchAccess = await assertProviderUserCanAccessBookingBranch(
      supabaseAdmin,
      user.id,
      user.role,
      providerId,
      (booking as BookingDbRow).location_id ?? null
    );
    if (branchAccess.allowed === false) {
      return errorResponse(branchAccess.message, "FORBIDDEN", 403);
    }

    const bookingData = booking as BookingDbRow;
    const transformedBooking = {
      id: bookingData.id,
      booking_number: bookingData.booking_number,
      customer_id: bookingData.customer_id,
      provider_id: bookingData.provider_id,
      status: mapStatusFromDatabase(bookingData.status ?? "") as BookingResponse["status"],
      db_status: bookingData.status as BookingResponse["db_status"],
      location_type: (bookingData.location_type ?? "at_salon") as BookingResponse["location_type"],
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
      services: (bookingData.booking_services ?? []).map((bs) => {
        const offering = Array.isArray(bs.offerings) ? bs.offerings[0] : bs.offerings;
        const staffObj = Array.isArray(bs.staff) ? bs.staff[0] : bs.staff;
        return {
        id: bs.id,
        offering_id: bs.offering_id,
        service_id: bs.offering_id,
        offering_name: offering?.title ?? "Unknown Service",
        service_name: offering?.title ?? "Unknown Service",
        staff_id: bs.staff_id,
        staff_name: staffObj?.name,
        staff: staffObj,
        duration_minutes: bs.duration_minutes,
        price: bs.price,
        scheduled_start_at: bs.scheduled_start_at,
        scheduled_end_at: bs.scheduled_end_at,
        guest_name: bs.guest_name ?? null,
        customization: null,
      };
      }),
      products: (bookingData.booking_products ?? []).map((bp) => {
        const product = Array.isArray(bp.products) ? bp.products[0] : bp.products;
        return {
        id: bp.id,
        product_id: bp.product_id,
        product_variant_id: bp.product_variant_id,
        product_variant: bp.product_variant,
        product_name: product?.name ?? "Unknown Product",
        quantity: bp.quantity,
        unit_price: bp.unit_price,
        total_price: bp.total_price,
      };
      }),
      addons: [], // Would need separate fetch from booking_addons
      package_id: bookingData.package_id || null,
      package_name: (() => {
        const sp = bookingData.service_packages;
        const one = Array.isArray(sp) ? sp[0] : sp;
        return typeof one?.name === "string" ? one.name : null;
      })(),
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
      currency: bookingData.currency || lastResortCurrency,
      payment_status: (bookingData.payment_status ?? "pending") as BookingResponse["payment_status"],
      payment_method: null, // payment_method_id is the actual column
      special_requests: bookingData.special_requests || null,
      loyalty_points_earned: bookingData.loyalty_points_earned || 0,
      current_stage: (bookingData.current_stage ?? null) as BookingResponse["current_stage"],
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
        const participants = (one as { booking_participants?: Array<{ id?: string; participant_name?: string; participant_email?: string; participant_phone?: string; is_primary_contact?: boolean }> })?.booking_participants ?? [];
        return participants.map((p) => ({
          id: p.id,
          participant_name: p.participant_name,
          participant_email: p.participant_email,
          participant_phone: p.participant_phone,
          is_primary_contact: p.is_primary_contact,
        }));
      })(),
      // At-home arrival verification (no raw OTP / QR secrets exposed to provider)
      arrival_otp_verified: Boolean((bookingData as { arrival_otp_verified?: boolean }).arrival_otp_verified),
      qr_code_verified: Boolean((bookingData as { qr_code_verified?: boolean }).qr_code_verified),
      arrival_otp_expires_at: (bookingData as { arrival_otp_expires_at?: string | null }).arrival_otp_expires_at ?? null,
      qr_code_expires_at: (bookingData as { qr_code_expires_at?: string | null }).qr_code_expires_at ?? null,
      arrival_otp_pending: (() => {
        const row = bookingData as {
          location_type?: string;
          arrival_otp?: string | null;
          arrival_otp_expires_at?: string | null;
          arrival_otp_verified?: boolean | null;
        };
        if (row.location_type !== "at_home") return false;
        if (!row.arrival_otp) return false;
        if (row.arrival_otp_verified) return false;
        if (row.arrival_otp_expires_at && isOTPExpired(row.arrival_otp_expires_at)) return false;
        return true;
      })(),
      qr_arrival_pending: (() => {
        const row = bookingData as {
          location_type?: string;
          qr_code_data?: unknown;
          qr_code_expires_at?: string | null;
          qr_code_verified?: boolean | null;
        };
        if (row.location_type !== "at_home") return false;
        if (row.qr_code_data == null) return false;
        if (row.qr_code_verified) return false;
        if (row.qr_code_expires_at && isQRCodeExpired(row.qr_code_expires_at)) return false;
        return true;
      })(),
    } as unknown as BookingResponse;

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
      transformedBooking.custom_field_values = customFieldValues;
    }

    // For completed bookings, include provider points earned (from provider_point_transactions)
    if (bookingData.status === "completed" && providerId && id) {
      try {
        const { data: tx, error: txError } = await supabaseAdmin
          .from("provider_point_transactions")
          .select("points")
          .eq("provider_id", providerId)
          .eq("source", "booking_completed")
          .eq("source_id", id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        const points = txError ? null : (tx?.points ?? null);
        transformedBooking.provider_points_earned =
          typeof points === "number" && Number.isFinite(points) && points >= 0 ? points : null;
      } catch {
        transformedBooking.provider_points_earned = null;
      }
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

    const tenantId = await resolveTenantIdWithZaFallback(request);
    const tenantRegion = await getTenantRegionConfig(tenantId);
    const lastResortCurrency = tenantRegion?.defaultCurrency ?? LAST_RESORT_CURRENCY;

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

    const supabaseAdminPatch = getSupabaseAdmin();
    const branchAccessPatch = await assertProviderUserCanAccessBookingBranch(
      supabaseAdminPatch,
      user.id,
      user.role,
      providerId,
      (currentBooking as { location_id?: string | null }).location_id ?? null
    );
    if (branchAccessPatch.allowed === false) {
      return errorResponse(branchAccessPatch.message, "FORBIDDEN", 403);
    }

    // Conflict detection: Check if booking was modified by another user
    const { version, updated_at } = body;
    if (version !== undefined) {
      // Using version number for optimistic locking
      const currentVersion = (currentBooking as BookingRow).version || 0;
      if (version !== currentVersion) {
        return errorResponse(
          "This booking was modified by another user. Please refresh and try again.",
          "CONFLICT",
          409
        );
      }
    } else if (updated_at) {
      // Alternative: Using updated_at timestamp for conflict detection
      const currentUpdatedAt = new Date((currentBooking as BookingRow).updated_at).getTime();
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

    // Slot conflict check when rescheduling (scheduled_at or services with new times)
    const isReschedule = scheduled_at != null || (Array.isArray(services) && services.some((s: { scheduled_start_at?: string | null }) => s.scheduled_start_at != null));
    if (isReschedule) {
      const supabaseAdmin = getSupabaseAdmin();
      const { data: currentServices } = await supabaseAdmin
        .from("booking_services")
        .select("staff_id, scheduled_start_at, scheduled_end_at, duration_minutes, offerings(buffer_minutes)")
        .eq("booking_id", id)
        .order("scheduled_start_at", { ascending: true });

      let newStart: Date;
      let newEnd: Date;
      let staffId: string | null = staff_id ?? null;
      let bufferMinutes = 15;

      if (Array.isArray(services) && services.length > 0) {
        const firstWithTime = services.find((s: { scheduled_start_at?: string }) => s.scheduled_start_at);
        const baseAt = scheduled_at ?? (currentBooking as BookingRow).scheduled_at ?? currentServices?.[0]?.scheduled_start_at;
        const startAt = firstWithTime?.scheduled_start_at ?? baseAt;
        newStart = new Date(startAt);
        let endMs = newStart.getTime();
        for (const s of services) {
          const dur = (s.duration ?? s.duration_minutes ?? 60) * 60 * 1000;
          endMs += dur;
        }
        newEnd = new Date(endMs);
        if (staff_id === undefined && currentServices?.[0]) {
          staffId = (currentServices[0] as BookingServiceConflictRow).staff_id ?? null;
        }
        const firstBsAlt = (currentServices?.[0]) as BookingServiceConflictRow | undefined;
        const firstOffering = firstBsAlt?.offerings != null ? (Array.isArray(firstBsAlt.offerings) ? firstBsAlt.offerings[0] : firstBsAlt.offerings) : undefined;
        if (firstOffering?.buffer_minutes != null) bufferMinutes = Number(firstOffering.buffer_minutes);
      } else {
        newStart = new Date(scheduled_at);
        const servicesList = (currentServices ?? []) as BookingServiceConflictRow[];
        const duration = servicesList.reduce((sum: number, bs: BookingServiceConflictRow) => sum + (Number(bs.duration_minutes) || 0), 0) || 60;
        newEnd = new Date(newStart.getTime() + duration * 60 * 1000);
        if (staff_id === undefined && servicesList[0]) {
          staffId = servicesList[0].staff_id ?? null;
        }
        const firstBs = servicesList[0];
        const firstOff = firstBs?.offerings != null ? (Array.isArray(firstBs.offerings) ? firstBs.offerings[0] : firstBs.offerings) : undefined;
        if (firstOff?.buffer_minutes != null) bufferMinutes = Number(firstOff.buffer_minutes);
      }

      if (staffId) {
        const conflictResult = await checkBookingConflict(
          supabaseAdmin,
          staffId,
          newStart,
          newEnd,
          bufferMinutes,
          id
        );
        if (conflictResult.hasConflict) {
          return errorResponse(
            "This time slot is no longer available. Please choose another time.",
            "SLOT_CONFLICT",
            409
          );
        }
      }
    }

    // Update booking
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    // Update status if provided (map frontend status to database status)
    if (status) {
      updateData.status = mapStatusToDatabase(status);
    }

    // Update current_stage (e.g. client_arrived for in-salon check-in, or null when starting service)
    if (current_stage !== undefined) {
      const locationType = (currentBooking as BookingRow)?.location_type;
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
    const currentVersion = (currentBooking as BookingRow).version || 0;
    updateData.version = currentVersion + 1;

    // Update current_stage for at-home bookings
    // Use the mapped database status for the check
    const dbStatus = updateData.status;
    const locationType = (currentBooking as BookingRow)?.location_type;
    
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

    // Use service role: RLS only allows the provider *owner* to UPDATE bookings; staff with
    // edit_appointments already passed requirePermission + branch checks above.
    const { error: updateError } = await supabaseAdminPatch
      .from("bookings")
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
          product_variant_id,
          quantity,
          unit_price,
          total_price,
          products:products!booking_products_product_id_fkey(id, name, retail_price),
          product_variant:product_variants(id, option_values)
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
        const baseScheduledAt = scheduled_at || (currentBooking as BookingRow).scheduled_at;
        type ServiceUpdateInput = { scheduled_start_at?: string; duration?: number; serviceId?: string; offering_id?: string; price?: number; currency?: string };
        const servicesToInsert = services.map((service: ServiceUpdateInput) => {
          const startAt = service.scheduled_start_at || baseScheduledAt;
          const duration = service.duration ?? 60;
          const start = new Date(startAt);
          const end = new Date(start.getTime() + duration * 60 * 1000);
          return {
            booking_id: id,
            offering_id: service.serviceId || service.offering_id,
            staff_id: staff_id ?? (currentBooking as BookingRow).staff_id ?? null,
            duration_minutes: duration,
            price: service.price || 0,
            currency: service.currency || lastResortCurrency,
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
        type ProductUpdateInput = { productId: string; productVariantId?: string | null; quantity?: number; unitPrice?: number; totalPrice?: number };
        const productsToInsert = products.map((product: ProductUpdateInput) => ({
          booking_id: id,
          product_id: product.productId,
          product_variant_id: product.productVariantId ?? null,
          quantity: product.quantity ?? 1,
          unit_price: product.unitPrice ?? 0,
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
    const customerId = (currentBooking as BookingRow).customer_id;
    const previousStatus = (currentBooking as BookingRow).status;

    // Send notifications for status changes
    if (dbStatus && dbStatus !== previousStatus) {
      try {
        const { sendCancellationNotification, sendRescheduleNotification, sendBookingConfirmationNotification } = await import('@/lib/bookings/notifications');
        
        if (dbStatus === "cancelled") {
          // Reverse loyalty points if they were earned for this booking
          const loyaltyPointsEarned = (currentBooking as BookingRow).loyalty_points_earned || 0;
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
                      description: `Points reversed for cancelled booking ${(currentBooking as BookingRow).booking_number || id}`,
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
        } else if (scheduled_at && scheduled_at !== (currentBooking as BookingRow).scheduled_at) {
          // Send reschedule notification
          await sendRescheduleNotification(
            id,
            new Date((currentBooking as BookingRow).scheduled_at),
            new Date(scheduled_at)
          );
        } else if (dbStatus === "completed") {
          // Award customer loyalty points for completed booking
          const loyaltyBaseAmount = resolveLoyaltyBaseAmount(currentBooking as BookingRow);
          
          if (loyaltyBaseAmount > 0 && customerId) {
            try {
              const { calculateLoyaltyPoints } = await import("@/lib/loyalty/calculate-points");
              const { data: existingTransaction } = await supabaseAdmin
                .from("loyalty_point_transactions")
                .select("id")
                .eq("reference_id", id)
                .eq("reference_type", "booking")
                .eq("transaction_type", "earned")
                .maybeSingle();

              if (!existingTransaction) {
                const currency = (currentBooking as BookingRow).currency || lastResortCurrency;
                const pointsEarned = await calculateLoyaltyPoints(loyaltyBaseAmount, supabaseAdmin, currency);

                if (pointsEarned > 0) {
                  // Create loyalty transaction for customer
                  const { error: loyaltyError } = await supabaseAdmin
                    .from("loyalty_point_transactions")
                    .insert({
                      user_id: customerId,
                      transaction_type: "earned",
                      points: pointsEarned,
                      description: `Points earned for completed booking ${(currentBooking as BookingRow).booking_number || id}`,
                      reference_id: id,
                      reference_type: "booking",
                      expires_at: null, // Or set expiry based on config
                    });

                  if (!loyaltyError) {
                    // Update booking with loyalty_points_earned
                    await supabaseAdmin
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

          // Award provider points for completed booking (same as complete-service)
          if (providerId && id) {
            awardPointsForBooking(providerId, id).catch((err) =>
              console.error("Failed to award provider points on completion:", err)
            );
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

    const eventType = dbStatus ? eventTypeMap[String(dbStatus)] : null;
    if (eventType) {
      // Create booking event (existing system)
      await supabase
        .from("booking_events")
        .insert({
          booking_id: id,
          event_type: eventType,
          event_data: {
            previous_status: (currentBooking as BookingRow)?.status,
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
              previous_status: (currentBooking as BookingRow)?.status,
              new_status: status,
              field: "status",
              old_value: (currentBooking as BookingRow)?.status,
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
        const bookingNumber = (updatedBooking as RefetchedBookingRow)?.ref_number || (currentBooking as BookingRow)?.ref_number || "";
        const previousStatus = (currentBooking as BookingRow)?.status;
        const newStatus = dbStatus || previousStatus;
        const wasRescheduled = scheduled_at && scheduled_at !== (currentBooking as BookingRow)?.scheduled_at;

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
          notificationMessage = statusMessages[String(newStatus)] || `Your booking ${bookingNumber ? `(${bookingNumber}) ` : ""}status has been updated.`;
          notificationType = "booking_status_update";
        } else if (staff_id && staff_id !== (currentBooking as BookingRow)?.staff_id) {
          notificationTitle = "Staff Assigned";
          notificationMessage = `A staff member has been assigned to your booking ${bookingNumber ? `(${bookingNumber}) ` : ""}.`;
          notificationType = "booking_staff_changed";
        } else {
          notificationMessage = `Your booking ${bookingNumber ? `(${bookingNumber}) ` : ""}has been updated.`;
        }

        // Insert notification into database
        const { insertNotification } = await import("@/lib/notifications/insert-notification");
        await insertNotification({
          user_id: customerId,
          type: notificationType,
          title: notificationTitle,
          message: notificationMessage,
          data: {
            booking_id: id,
            booking_number: bookingNumber,
            status: newStatus,
            previous_status: previousStatus,
            was_rescheduled: wasRescheduled,
          },
          action_url: `/account-settings/bookings/${id}`,
        });

        // Also send push notification via OneSignal using templates
        try {
          const { sendTemplateNotification } = await import("@/lib/notifications/onesignal");

          const bookingTenantForMoney =
            (updatedBooking as RefetchedBookingRow & { tenant_id?: string | null })?.tenant_id ??
            (currentBooking as BookingRow & { tenant_id?: string | null })?.tenant_id ??
            tenantId;
          const { format: formatBookingMoney } =
            await getTenantMoneyFormatter(bookingTenantForMoney);

          // Get booking details for template variables
          const bookingScheduledAt = (updatedBooking as RefetchedBookingRow)?.scheduled_at || (currentBooking as BookingRow)?.scheduled_at;
          const previousScheduledAt = (currentBooking as BookingRow)?.scheduled_at;
          
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
              services: (updatedBooking as RefetchedBookingRow)?.service_name || (currentBooking as BookingRow)?.service_name || "service",
              total_amount: formatBookingMoney(
                (updatedBooking as RefetchedBookingRow)?.total_amount ||
                  (currentBooking as BookingRow)?.total_amount ||
                  0,
              ),
              booking_number: bookingNumber || "",
              booking_id: id,
            };
          } else if (newStatus === "cancelled") {
            templateKey = "booking_cancelled";
            templateVariables = {
              provider_name: providerName,
              booking_date: scheduledDate || "your appointment",
              booking_number: bookingNumber || "",
              refund_info: ((updatedBooking as RefetchedBookingRow)?.payment_status || (currentBooking as BookingRow)?.payment_status) === "paid" 
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
              services: (updatedBooking as RefetchedBookingRow)?.service_name || (currentBooking as BookingRow)?.service_name || "service",
              booking_id: id,
            };
          }

          // Send notification using template if available
          if (templateKey) {
            await sendTemplateNotification(
              templateKey,
              [customerId],
              templateVariables,
              ["push", "email"],
              { appType: "customer" }
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
    const bookingData = updatedBooking as BookingDbRow;
    const transformedBooking: Booking = {
      id: bookingData.id,
      booking_number: bookingData.booking_number,
      customer_id: bookingData.customer_id,
      provider_id: bookingData.provider_id,
      status: mapStatusFromDatabase(bookingData.status),
      db_status: bookingData.status as BookingStatus,
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
      services: (bookingData.booking_services ?? []).map((bs) => {
        const offering = Array.isArray(bs.offerings) ? bs.offerings[0] : bs.offerings;
        const staffObj = Array.isArray(bs.staff) ? bs.staff[0] : bs.staff;
        return {
        id: bs.id,
        offering_id: bs.offering_id,
        service_id: bs.offering_id,
        offering_name: offering?.title ?? "Unknown Service",
        service_name: offering?.title ?? "Unknown Service",
        staff_id: bs.staff_id,
        staff_name: staffObj?.name ?? null,
        duration_minutes: bs.duration_minutes,
        price: bs.price,
        customization: null,
      };
      }),
      products: (bookingData.booking_products ?? []).map((bp) => {
        const product = Array.isArray(bp.products) ? bp.products[0] : bp.products;
        return {
        id: bp.id,
        product_id: bp.product_id,
        product_variant_id: bp.product_variant_id,
        product_variant: bp.product_variant,
        product_name: product?.name ?? "Unknown Product",
        quantity: bp.quantity,
        unit_price: bp.unit_price,
        total_price: bp.total_price,
      };
      }),
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
      currency: bookingData.currency || lastResortCurrency,
      payment_status: bookingData.payment_status,
      payment_method: null,
      special_requests: bookingData.special_requests || null,
      loyalty_points_earned: bookingData.loyalty_points_earned || 0,
      created_at: bookingData.created_at,
      updated_at: bookingData.updated_at,
      version: bookingData.version || 0,
    } as unknown as Booking & { version: number };

    invalidateProviderBookingsReadCache(providerId);
    return successResponse({ booking: transformedBooking });
  } catch (error) {
    return handleApiError(error, "Failed to update booking");
  }
}
