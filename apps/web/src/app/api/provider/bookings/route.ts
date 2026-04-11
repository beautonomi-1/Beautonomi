import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError, errorResponse, normalizePhoneToE164 } from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { checkBookingLimitsFeatureAccess } from "@/lib/subscriptions/feature-access";
import type { Booking } from "@/types/beautonomi";
import { determineAppointmentStatusFromDB } from "@/lib/provider-portal/appointment-settings";
import { withRouteMetrics } from "@/lib/monitoring/route-metrics";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";

import { mapStatusToProvider } from "@/lib/utils/booking-status";
import {
  checkBookingConflict,
  checkBookingConflictForProvider,
  checkActiveHoldOverlap,
  canOverrideDoubleBooking,
} from "@/lib/bookings/conflict-check";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { isProviderCalendarWindowBlocked } from "@/lib/public-booking/provider-calendar-block-overlap";
import {
  createBookingsReadCacheKey,
  getCachedProviderBookingsList,
  invalidateProviderBookingsReadCache,
  setCachedProviderBookingsList,
} from "@/lib/bookings/provider-bookings-read-cache";

// Map frontend status to database enum values
// Frontend: booked, started, completed, cancelled, no_show
// Database: pending, confirmed, in_progress, completed, cancelled, no_show
function mapStatusToDatabase(frontendStatus: string): string {
  const mapping: Record<string, string> = {
    booked: "confirmed",
    started: "in_progress",
    completed: "completed",
    cancelled: "cancelled",
    no_show: "no_show",
    // Also handle database values passed directly
    pending: "pending",
    confirmed: "confirmed",
    in_progress: "in_progress",
  };
  return mapping[frontendStatus] || "confirmed";
}

// Map database status to frontend status
function mapStatusFromDatabase(dbStatus: string): string {
  return mapStatusToProvider(dbStatus as any);
}

const MAX_PROVIDER_FORM_RESPONSES_BYTES = 120_000;

/** Optional JSON map: form_id -> field values (same shape as checkout). */
function parseProviderFormResponses(raw: unknown): Record<string, unknown> | null {
  if (raw == null) return null;
  if (typeof raw !== "object" || Array.isArray(raw)) return null;
  try {
    const s = JSON.stringify(raw);
    if (s.length > MAX_PROVIDER_FORM_RESPONSES_BYTES) {
      console.warn("provider_form_responses exceeded max size, ignoring");
      return null;
    }
  } catch {
    return null;
  }
  return raw as Record<string, unknown>;
}

function createWalkInEmail() {
  // Ensure we always have a valid, unique email for walk-in customers
  // since `public.users.email` is NOT NULL + UNIQUE and mirrors `auth.users.email`.
  const uuid =
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `walkin+${uuid}@beautonomi.invalid`;
}

async function waitForUserProfileRow(supabaseAdmin: any, userId: string) {
  // The `auth.users` insert triggers `public.users` insert. In practice it's fast,
  // but we retry a few times to avoid a race when we immediately reference `public.users`.
  for (let i = 0; i < 5; i++) {
    const { data } = await supabaseAdmin.from("users").select("id").eq("id", userId).maybeSingle();
    if (data?.id) return;
    await new Promise((r) => setTimeout(r, 80));
  }
}

/**
 * GET /api/provider/bookings
 * 
 * Get provider's bookings with filters
 */
async function handleGetProviderBookings(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);

    // NOTE: We use the admin client for provider booking reads.
    // RLS for bookings is intentionally strict and depends on provider<->user links.
    // In the provider portal we already scope by provider_id (resolved server-side)
    // and enforce roles, so using admin here avoids "saved but not visible" issues.
    const supabase = await getSupabaseServer(request);
    const supabaseAdmin = await getSupabaseAdmin();
    const { searchParams } = new URL(request.url);

    // Get provider ID
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const tenantId = await resolveTenantIdWithZaFallback(request);
    const tenantRegion = await getTenantRegionConfig(tenantId);
    const lastResortCurrency = tenantRegion?.defaultCurrency ?? LAST_RESORT_CURRENCY;

    const cacheKey = createBookingsReadCacheKey(providerId, new URL(request.url).search);
    const cachedList = getCachedProviderBookingsList(cacheKey);
    if (cachedList) {
      const cachedResponse = successResponse(cachedList as Booking[]);
      cachedResponse.headers.set("Cache-Control", "private, max-age=5, stale-while-revalidate=10");
      return cachedResponse;
    }

    let query = supabaseAdmin
      .from("bookings")
      .select(
        `
        *,
        version,
        customers:users!bookings_customer_id_fkey(id, full_name, email, phone),
        locations:provider_locations(id, name, address_line1, city),
        group_bookings!bookings_group_booking_id_fkey(ref_number),
        service_packages!bookings_package_id_fkey(id, name),
        booking_services(
          id,
          offering_id,
          staff_id,
          duration_minutes,
          price,
          currency,
          scheduled_start_at,
          scheduled_end_at,
          guest_name,
          offering:offerings(
            id,
            title,
            duration_minutes,
            price
          ),
          staff:provider_staff(
            id,
            name,
            role
          )
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
      .eq("provider_id", providerId);

    // Apply filters
    const customerId = searchParams.get("customer_id");
    if (customerId) {
      query = query.eq("customer_id", customerId);
    }

    const status = searchParams.get("status");
    if (status && status !== "all") {
      // Handle comma-separated statuses; map frontend values (e.g. "booked") to DB enum (pending, confirmed, in_progress, completed, cancelled, no_show)
      if (status.includes(",")) {
        const raw = status.split(",").map(s => s.trim()).filter(Boolean);
        const statuses = [...new Set(raw.map(mapStatusToDatabase))];
        if (statuses.length) query = query.in("status", statuses);
      } else {
        query = query.eq("status", mapStatusToDatabase(status));
      }
    }

    const startDate = searchParams.get("start_date");
    const endDate = searchParams.get("end_date");
    if (startDate) {
      // Include the full start date (from 00:00:00)
      query = query.gte("scheduled_at", `${startDate}T00:00:00`);
    }
    if (endDate) {
      // Include the full end date (until 23:59:59)
      query = query.lte("scheduled_at", `${endDate}T23:59:59`);
    }

    // Filter by location_id if provided
    const locationId = searchParams.get("location_id");
    if (locationId) {
      query = query.eq("location_id", locationId);
    }

    const limitParam = searchParams.get("limit");
    if (limitParam) {
      const parsedLimit = Number(limitParam);
      if (Number.isFinite(parsedLimit) && parsedLimit > 0) {
        query = query.limit(Math.min(parsedLimit, 1000));
      }
    }

    // Note: team_member_id filtering is done client-side in the API client
    // because staff_id is stored in booking_services (child table), not directly in bookings

    const { data: bookings, error } = await query
      .order("scheduled_at", { ascending: false });

    if (error) {
      throw error;
    }

    // Transform to match Booking type
    const transformedBookings = (bookings || []).map((booking: any) => {
      // Transform booking_services to include staff info and guest_name for group bookings
      const services = (booking.booking_services || []).map((bs: any) => ({
        id: bs.offering_id || bs.id,
        offering_id: bs.offering_id,
        staff_id: bs.staff_id || null,
        staff_name: bs.staff?.name || null,
        name: bs.offering?.title || bs.offerings?.title || "Service",
        offering_name: bs.offering?.title || bs.offerings?.title || "Service",
        service_name: bs.offering?.title || bs.offerings?.title || "Service",
        duration_minutes: bs.duration_minutes || bs.offering?.duration_minutes || 60,
        price: bs.price || bs.offering?.price || 0,
        currency: bs.currency || lastResortCurrency,
        scheduled_start_at: bs.scheduled_start_at,
        scheduled_end_at: bs.scheduled_end_at,
        guest_name: bs.guest_name || null,
      }));

      // Transform booking_products for front desk and calendar display
      const products = (booking.booking_products || []).map((bp: any) => ({
        id: bp.id,
        product_id: bp.product_id,
        product_variant_id: bp.product_variant_id,
        product_variant: bp.product_variant,
        product_name: bp.products?.name || "Product",
        quantity: bp.quantity || 1,
        unit_price: bp.unit_price || bp.products?.retail_price || 0,
        total_price: bp.total_price || (bp.unit_price || bp.products?.retail_price || 0) * (bp.quantity || 1),
      }));

      return {
        id: booking.id,
        booking_number: booking.booking_number,
        customer_id: booking.customer_id,
        version: booking.version || 0,
        provider_id: booking.provider_id,
        status: mapStatusFromDatabase(booking.status),
        /** DB enum so clients can style pending vs confirmed even when `status` is mapped to `booked`. */
        db_status: booking.status,
        location_type: booking.location_type,
        location_id: booking.location_id,
        // Construct address object (include at-home / house-call detail fields for calendar + list UIs)
        address: booking.address_line1 ? {
          line1: booking.address_line1,
          line2: booking.address_line2,
          city: booking.address_city,
          state: booking.address_state,
          country: booking.address_country,
          postal_code: booking.address_postal_code,
          latitude: booking.address_latitude,
          longitude: booking.address_longitude,
          apartment_unit: booking.apartment_unit,
          building_name: booking.building_name,
          floor_number: booking.floor_number,
          access_codes: booking.access_codes
            ? (typeof booking.access_codes === "string" ? JSON.parse(booking.access_codes) : booking.access_codes)
            : null,
          parking_instructions: booking.parking_instructions,
          location_landmarks: booking.location_landmarks,
        } : null,
        house_call_instructions: booking.house_call_instructions || null,
        scheduled_at: booking.scheduled_at,
        completed_at: booking.completed_at || null,
        cancelled_at: booking.cancelled_at || null,
        cancellation_reason: booking.cancellation_reason || null,
        services: services,
        products: products,
        addons: [], // Addons would need to be fetched from booking_addons table
        package_id: booking.package_id || null,
        package_name: (() => {
          const sp = (booking as { service_packages?: { name?: string } | Array<{ name?: string }> }).service_packages;
          const one = Array.isArray(sp) ? sp[0] : sp;
          return typeof one?.name === "string" ? one.name : null;
        })(),
        subtotal: booking.subtotal || 0,
        discount_amount: booking.discount_amount || 0,
        discount_code: booking.discount_code || null,
        discount_reason: booking.discount_reason || null,
        tax_amount: booking.tax_amount || 0,
        tax_rate: booking.tax_rate || 0,
        service_fee_percentage: booking.service_fee_percentage || 0,
        service_fee_amount: booking.service_fee_amount || 0,
        tip_amount: booking.tip_amount || 0,
        total_amount: booking.total_amount || 0,
        total_paid: booking.total_paid || 0,
        total_refunded: booking.total_refunded || 0,
        currency: booking.currency || lastResortCurrency,
        payment_status: booking.payment_status,
        payment_method: null, // payment_method_id is the actual column
        special_requests: booking.special_requests || null,
        loyalty_points_earned: booking.loyalty_points_earned || 0,
        created_at: booking.created_at,
        updated_at: booking.updated_at,
        // Include current_stage for Mangomint-style status/color (client_arrived → WAITING, etc.)
        current_stage: booking.current_stage || null,
        // Include joined data for UI convenience (provider portal calendar uses these)
        customers: booking.customers || null,
        locations: booking.locations || null,
        // Flattened convenience fields for the bookings list page
        customer_name: booking.customers?.full_name || null,
        location_name: booking.locations?.name || null,
        staff_name: services[0]?.staff_name || null,
        // Group booking: show on calendar and list
        is_group_booking: Boolean(booking.is_group_booking),
        group_booking_id: booking.group_booking_id || null,
        group_booking_ref: (() => {
          const gb = (booking as { group_bookings?: { ref_number?: string } | Array<{ ref_number?: string }> }).group_bookings;
          return Array.isArray(gb) ? gb[0]?.ref_number ?? null : gb?.ref_number ?? null;
        })(),
        provider_form_responses: booking.provider_form_responses ?? null,
      };
    });

    setCachedProviderBookingsList(cacheKey, transformedBookings as unknown as Booking[]);

    const response = successResponse(transformedBookings as unknown as Booking[]);
    
    // Add cache headers for faster subsequent requests (5 seconds)
    response.headers.set('Cache-Control', 'private, max-age=5, stale-while-revalidate=10');
    
    return response;
  } catch (error) {
    console.error("[GET /api/provider/bookings]", error);
    return handleApiError(error, "Failed to fetch bookings");
  }
}

/**
 * POST /api/provider/bookings
 * 
 * Create a new booking/appointment
 */
async function handleCreateProviderBooking(request: NextRequest) {
  try {
    // Check permission to create appointments
    const permissionCheck = await requirePermission('create_appointments', request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;

    const supabase = await getSupabaseServer(request);
    const supabaseAdmin = await getSupabaseAdmin(); // Use admin client to bypass RLS
    const body = await request.json();
    const providerFormResponses = parseProviderFormResponses(
      (body as { provider_form_responses?: unknown }).provider_form_responses
    );

    // Get provider ID
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const tenantId = await resolveTenantIdWithZaFallback(request);
    const tenantRegion = await getTenantRegionConfig(tenantId);
    const lastResortCurrency = tenantRegion?.defaultCurrency ?? LAST_RESORT_CURRENCY;

    invalidateProviderBookingsReadCache(providerId);

    // Check booking limits
    const bookingAccess = await checkBookingLimitsFeatureAccess(providerId);
    if (bookingAccess.enabled && bookingAccess.maxBookingsPerMonth) {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const { data: bookingsThisMonth } = await supabaseAdmin
        .from("bookings")
        .select("id")
        .eq("provider_id", providerId)
        .gte("created_at", startOfMonth.toISOString());

      if ((bookingsThisMonth?.length || 0) >= bookingAccess.maxBookingsPerMonth) {
        return errorResponse(
          `You've reached your monthly booking limit (${bookingAccess.maxBookingsPerMonth}). Please upgrade your plan to create more bookings.`,
          "LIMIT_REACHED",
          403
        );
      }
    }

    // Determine appointment status based on provider settings
    // This handles: default status, require confirmation, and auto-confirm logic
    const finalStatus = await determineAppointmentStatusFromDB(
      supabaseAdmin,
      providerId,
      body.status // Allow explicit status override from request body
    );

    // Handle walk-in clients - create or find customer
    // customer_id is REQUIRED, so we must always have one
    let customerId = body.customer_id;
    
    if (!customerId) {
      // Check if customer exists by email or phone (use admin client to bypass RLS)
      if (body.customer_email) {
        const { data: existingCustomer } = await supabaseAdmin
          .from("users")
          .select("id")
          .eq("email", body.customer_email)
          .maybeSingle();
        
        if (existingCustomer) {
          customerId = existingCustomer.id;
        }
      }
      
      // Also check by phone if email didn't work
      if (!customerId && body.customer_phone) {
        const { data: existingCustomer } = await supabaseAdmin
          .from("users")
          .select("id")
          .eq("phone", body.customer_phone)
          .maybeSingle();
        
        if (existingCustomer) {
          customerId = existingCustomer.id;
        }
      }

      // If still no customer, create a new one for walk-in (use admin client)
      if (!customerId) {
        if (!body.customer_name) {
          throw new Error("Customer name is required for walk-in appointments");
        }

        // IMPORTANT:
        // `public.users.id` references `auth.users.id` and has no default.
        // So we must create the Auth user first; a trigger will create `public.users`.
        const walkInEmail = body.customer_email || createWalkInEmail();
        // Normalize phone to E.164 format if provided
        const normalizedPhone = normalizePhoneToE164(body.customer_phone);
        const { data: createdUser, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
          email: walkInEmail,
          phone: normalizedPhone,
          email_confirm: true,
          user_metadata: {
            full_name: body.customer_name,
            phone: body.customer_phone || null, // Store original phone in metadata
            role: "customer",
          },
        });

        if (createUserError || !createdUser?.user?.id) {
          console.error("Error creating auth user for walk-in:", createUserError);
          throw new Error(`Failed to create customer: ${createUserError?.message || "Unknown error"}`);
        }

        customerId = createdUser.user.id;
        
        // Wait for trigger to create public.users record
        await waitForUserProfileRow(supabaseAdmin, customerId);
        
        // Ensure user record exists - if trigger failed, create it manually
        const { data: userProfile, error: _profileError } = await supabaseAdmin
          .from("users")
          .select("id, full_name, phone")
          .eq("id", customerId)
          .maybeSingle();
        
        if (!userProfile) {
          console.warn("User profile not created by trigger, creating manually for walk-in customer");
          // Manually create the user record if trigger didn't fire
          const { error: insertError } = await supabaseAdmin
            .from("users")
            .insert({
              id: customerId,
              email: walkInEmail,
              full_name: body.customer_name,
              phone: body.customer_phone || null,
              role: "customer",
            });
          
          if (insertError) {
            console.error("Error manually creating user profile:", insertError);
            // Don't fail the booking, but log the error
          }
        } else {
          // Update user profile with any additional info if needed
          const updateData: any = {};
          if (body.customer_name && !userProfile.full_name) {
            updateData.full_name = body.customer_name;
          }
          if (body.customer_phone && !userProfile.phone) {
            updateData.phone = body.customer_phone;
          }
          
          if (Object.keys(updateData).length > 0) {
            await supabaseAdmin
              .from("users")
              .update(updateData)
              .eq("id", customerId);
          }
        }
      }
    }
    
    if (!customerId) {
      throw new Error("Customer ID is required but could not be determined");
    }

    if (body.location_type === "at_home") {
      const addrLine = body.address?.line1 || body.address_line1;
      if (!addrLine || !String(addrLine).trim()) {
        return NextResponse.json(
          { error: "A service address is required for at-home bookings" },
          { status: 400 },
        );
      }
    }

    // Generate booking number (use admin client to bypass RLS)
    const { data: lastBooking } = await supabaseAdmin
      .from("bookings")
      .select("booking_number")
      .eq("provider_id", providerId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let bookingNumber = "BK0001";
    if (lastBooking?.booking_number) {
      const lastNum = parseInt(lastBooking.booking_number.replace("BK", ""));
      bookingNumber = `BK${String(lastNum + 1).padStart(4, "0")}`;
    }

    // Get effective tax rate if not provided: provider tax_rate_percent → platform default → 0% fallback
    // Also fetch tax_inclusive flag from the provider record to correctly branch the pricing formula
    let effectiveTaxRate = body.tax_rate;
    let taxInclusive = true; // SA default — most providers use VAT-inclusive pricing
    {
      const { data: providerTaxRow } = await supabaseAdmin
        .from("providers")
        .select("tax_rate_percent, tax_inclusive")
        .eq("id", providerId)
        .maybeSingle();
      if (providerTaxRow) {
        taxInclusive = providerTaxRow.tax_inclusive ?? true;
        if (!effectiveTaxRate || effectiveTaxRate === 0) {
          if (providerTaxRow.tax_rate_percent !== null && providerTaxRow.tax_rate_percent !== undefined) {
            effectiveTaxRate = providerTaxRow.tax_rate_percent;
          }
        }
      }
      if (!effectiveTaxRate || effectiveTaxRate === 0) {
        const { getEffectiveTaxRate } = await import("@/lib/platform-tax-settings");
        effectiveTaxRate = await getEffectiveTaxRate(providerId);
      }
    }

    // Determine location_id: use provided value, or default to provider's first salon location for at_salon bookings
    // Only salon locations (location_type = 'salon') accept at_salon/walk-in; base-only is for distance/travel.
    let locationId = body.location_id || null;
    if (body.location_type === "at_salon" || !body.location_type) {
      const { data: salonLocations } = await supabaseAdmin
        .from("provider_locations")
        .select("id, location_type")
        .eq("provider_id", providerId)
        .eq("is_active", true)
        .order("is_primary", { ascending: false })
        .order("created_at", { ascending: true });

      const firstSalon = salonLocations?.find((l: { location_type?: string }) => (l.location_type || "salon") === "salon");
      if (!locationId) {
        if (firstSalon) locationId = firstSalon.id;
      } else {
        // If client (e.g. provider app) sent a location_id that is base-only, use first salon instead
        const chosen = salonLocations?.find((l: { id: string }) => l.id === locationId);
        if (chosen && (chosen as { location_type?: string }).location_type === "base") {
          locationId = firstSalon?.id ?? locationId;
        }
      }
    }

    // Determine booking source. Only actual walk-ins should be 'walk_in';
    // other provider-created bookings should be 'provider' so payout/reporting
    // logic can distinguish platform-mediated from in-person revenue correctly.
    const bookingSource = body.booking_source || 'provider';
    
    // Referral source (where did this client come from?) — must belong to this provider
    let referralSourceId: string | null = body.referral_source_id ?? null;
    if (referralSourceId) {
      const { data: src } = await supabaseAdmin
        .from("referral_sources")
        .select("id")
        .eq("id", referralSourceId)
        .eq("provider_id", providerId)
        .eq("is_active", true)
        .maybeSingle();
      if (!src) referralSourceId = null; // Invalid or wrong provider, ignore
    }

    // For walk-in bookings, set service fee to 0 (platform doesn't charge for direct customers)
    const isWalkIn = bookingSource === 'walk_in';
    const serviceFeeAmount = isWalkIn ? 0 : (body.service_fee_amount || 0);
    const serviceFeePercentage = isWalkIn ? 0 : (body.service_fee_percentage || 0);

    const numOrNull = (v: unknown): number | null => {
      if (v == null || v === "") return null;
      const n = typeof v === "number" ? v : Number(v);
      return Number.isFinite(n) ? n : null;
    };
    const bodyLat = numOrNull(
      (body as { address_latitude?: unknown }).address_latitude ??
        (body as { address?: { latitude?: unknown; lat?: unknown } }).address?.latitude ??
        (body as { address?: { lat?: unknown } }).address?.lat,
    );
    const bodyLng = numOrNull(
      (body as { address_longitude?: unknown }).address_longitude ??
        (body as { address?: { longitude?: unknown; lng?: unknown } }).address?.longitude ??
        (body as { address?: { lng?: unknown } }).address?.lng,
    );

    // Server-side pricing recomputation to prevent client-trusted totals from causing incorrect records.
    // Handles both tax-inclusive (SA VAT model: prices already include tax) and tax-exclusive modes.
    const serverSubtotal = Number(body.subtotal) || 0;
    let serverDiscountAmount = Number(body.discount_amount) || 0;

    // When a package is linked, compute the package discount from SERVICES-ONLY subtotal
    // (excludes products/addons). This matches the customer flow in validate-booking.ts
    // which uses servicesSubtotal for package discount computation.
    if (body.package_id) {
      const { data: pkgRow } = await supabaseAdmin
        .from("service_packages")
        .select("price")
        .eq("id", body.package_id)
        .eq("provider_id", providerId)
        .maybeSingle();
      if (pkgRow?.price != null) {
        const servicesOnlySubtotal = Array.isArray(body.services)
          ? body.services.reduce((sum: number, svc: any) => sum + (Number(svc.price) || 0), 0)
          : serverSubtotal;
        if (pkgRow.price < servicesOnlySubtotal) {
          const packageDiscount = servicesOnlySubtotal - pkgRow.price;
          serverDiscountAmount = Math.max(serverDiscountAmount, packageDiscount);
        }
      }
    }
    const serverTipAmount = Number(body.tip_amount) || 0;
    const serverTravelFee = Number(body.travel_fee) || 0;
    const serverServiceFeeAmount = Number(serviceFeeAmount) || 0;
    const taxableAmount = Math.max(0, serverSubtotal - serverDiscountAmount);
    const taxRateDecimal = effectiveTaxRate / 100;

    const recomputedTaxAmount = taxInclusive
      ? Math.round((taxableAmount - taxableAmount / (1 + taxRateDecimal)) * 100) / 100
      : Math.round(taxableAmount * taxRateDecimal * 100) / 100;

    const recomputedTotalAmount = taxInclusive
      ? Math.round((taxableAmount + serverTipAmount + serverTravelFee + serverServiceFeeAmount) * 100) / 100
      : Math.round((taxableAmount + recomputedTaxAmount + serverTipAmount + serverTravelFee + serverServiceFeeAmount) * 100) / 100;

    const finalTaxAmount = recomputedTaxAmount;
    const finalTotalAmount = recomputedTotalAmount;

    // Prepare booking data - only include columns that exist in the bookings table
    // Note: services and addons are stored in separate tables (booking_services, booking_addons)
    const bookingData: any = {
      provider_id: providerId,
      customer_id: customerId,
      booking_number: bookingNumber,
      scheduled_at: body.scheduled_at,
      location_type: body.location_type || "at_salon",
      location_id: locationId,
      booking_source: bookingSource,
      address_line1: body.address?.line1 || body.address_line1 || null,
      address_line2: body.address?.line2 || body.address_line2 || null,
      address_city: body.address?.city || body.address_city || null,
      address_state: body.address?.state || body.address_state || null,
      address_country: body.address?.country || body.address_country || null,
      address_postal_code: body.address?.postal_code || body.address_postal_code || null,
      address_latitude: bodyLat,
      address_longitude: bodyLng,
      package_id: body.package_id || null,
      subtotal: serverSubtotal,
      discount_amount: serverDiscountAmount,
      discount_code: body.discount_code || null,
      discount_reason: body.discount_reason || null,
      tax_amount: finalTaxAmount,
      tax_rate: effectiveTaxRate,
      tip_amount: serverTipAmount,
      total_amount: finalTotalAmount,
      currency: body.currency || lastResortCurrency,
      status: mapStatusToDatabase(finalStatus),
      payment_status: (() => {
        if (body.payment_option === "deposit") {
          // Deposit booking: if cash deposit was collected now, partially_paid; otherwise pending
          return body.payment_method === "cash" ? "partially_paid" : "pending";
        }
        // Full payment: cash = paid, everything else = pending
        return body.payment_method === "cash" ? "paid" : "pending";
      })(),
      special_requests: body.special_requests || null,
      // Deposit metadata
      deposit_required: body.deposit_required || false,
      deposit_percentage: body.deposit_percentage || null,
      deposit_amount: body.deposit_amount || null,
      payment_option: body.payment_option || "full",
      loyalty_points_earned: 0,
      travel_fee: body.travel_fee || 0,
      service_fee_percentage: serviceFeePercentage,
      service_fee_amount: serviceFeeAmount,
      service_fee_paid_by: isWalkIn ? null : (body.service_fee_paid_by || 'customer'),
      referral_source_id: referralSourceId,
      ...(providerFormResponses ? { provider_form_responses: providerFormResponses } : {}),
    };

    // Validate required fields
    if (!bookingData.scheduled_at) {
      throw new Error("scheduled_at is required");
    }
    if (!bookingData.provider_id) {
      throw new Error("provider_id is required");
    }
    if (!bookingData.customer_id) {
      throw new Error("customer_id is required");
    }

    // Resolve staff and time range for conflict check / RPC path
    const staffId =
      body.services?.[0]?.staffId ||
      body.services?.[0]?.staff_id ||
      body.team_member_id ||
      body.staff_id ||
      null;
    let startAt: Date;
    let endAt: Date;
    const bufferMinutes = 15;
    if (body.services && Array.isArray(body.services) && body.services.length > 0) {
      const firstStart = body.services[0].scheduled_start_at || bookingData.scheduled_at;
      startAt = new Date(firstStart);
      let cursor = new Date(firstStart);
      for (const s of body.services) {
        const duration = s.duration ?? s.duration_minutes ?? 60;
        cursor = new Date(cursor.getTime() + duration * 60 * 1000);
      }
      endAt = new Date(cursor.getTime() + bufferMinutes * 60 * 1000);
    } else {
      const start = new Date(bookingData.scheduled_at);
      const duration = body.duration_minutes ?? 60;
      startAt = start;
      endAt = new Date(start.getTime() + (duration + bufferMinutes) * 60 * 1000);
    }

    const allowOverride = await canOverrideDoubleBooking(supabaseAdmin, providerId);
    const useRpcPath = staffId != null && !allowOverride;

    // Active customer holds block the window (same as public validate-booking).
    const holdOverlap = await checkActiveHoldOverlap(
      supabaseAdmin as any,
      providerId,
      startAt,
      endAt,
      { dbStaffId: staffId }
    );
    if (holdOverlap) {
      return errorResponse(
        "This time slot is no longer available. Please select another time.",
        "CONFLICT",
        409
      );
    }

    // Pre-compute required resource IDs for atomic allocation inside the RPC
    let requiredResourceIds: string[] = [];
    if (body.services && Array.isArray(body.services) && body.services.length > 0) {
      try {
        const { getRequiredResourcesForOffering } = await import("@/lib/resources/assignment");
        const allResourceIds = new Set<string>();
        for (const svc of body.services) {
          const offeringId = svc.serviceId || svc.service_id || svc.offering_id;
          if (!offeringId) continue;
          const required = await getRequiredResourcesForOffering(supabaseAdmin as any, offeringId);
          required.forEach((rid: string) => allResourceIds.add(rid));
        }
        requiredResourceIds = Array.from(allResourceIds);
      } catch (resErr) {
        console.warn("Could not pre-compute required resources:", resErr);
      }
    }

    let booking: any;

    if (useRpcPath) {
      // Conflict check before RPC (same slot as client/portal booking).
      // endAt already includes trailing bufferMinutes above; checkBookingConflict() adds buffer again — pass 0.
      const conflictResult = await checkBookingConflict(
        supabaseAdmin as any,
        staffId,
        startAt,
        endAt,
        0
      );
      if (conflictResult.hasConflict) {
        return errorResponse(
          "This time slot is no longer available. Please select another time.",
          "CONFLICT",
          409
        );
      }

      const calBlock = await isProviderCalendarWindowBlocked(supabaseAdmin as any, {
        providerId,
        locationId: body.location_id ?? undefined,
        staffId: staffId ?? null,
        startAt,
        endAt,
      });
      if (calBlock.blocked) {
        return errorResponse(
          calBlock.reason || "This time slot conflicts with a time block, day off, or is outside working hours.",
          "CALENDAR_BLOCK",
          409,
        );
      }

      // Build RPC payload (booking_services shape for create_booking_with_locking)
      const pBookingServices =
        body.services && Array.isArray(body.services) && body.services.length > 0
          ? (() => {
              let cursor = new Date(body.services[0].scheduled_start_at || bookingData.scheduled_at);
              return body.services.map((service: any) => {
                const duration = service.duration ?? service.duration_minutes ?? 60;
                const start = new Date(cursor);
                const end = new Date(cursor.getTime() + duration * 60 * 1000);
                cursor = new Date(end.getTime() + (service.buffer_minutes ?? 0) * 60 * 1000);
                return {
                  offering_id: service.serviceId || service.service_id || service.offering_id,
                  staff_id: service.staffId || service.staff_id || staffId,
                  duration_minutes: duration,
                  price: service.price ?? 0,
                  currency: service.currency || lastResortCurrency,
                  scheduled_start_at: start.toISOString(),
                  scheduled_end_at: end.toISOString(),
                };
              });
            })()
          : (() => {
              const start = new Date(bookingData.scheduled_at);
              const duration = body.duration_minutes ?? 60;
              const end = new Date(start.getTime() + duration * 60 * 1000);
              return [
                {
                  offering_id: body.offering_id || body.service_id,
                  staff_id: staffId,
                  duration_minutes: duration,
                  price: body.price ?? 0,
                  currency: body.currency || lastResortCurrency,
                  scheduled_start_at: start.toISOString(),
                  scheduled_end_at: end.toISOString(),
                },
              ];
            })();

      const pEndAt =
        body.services?.length > 0
          ? (() => {
              let c = new Date(body.services[0].scheduled_start_at || bookingData.scheduled_at);
              for (const s of body.services) {
                const dur = s.duration ?? s.duration_minutes ?? 60;
                c = new Date(c.getTime() + dur * 60 * 1000);
              }
              return new Date(c.getTime() + bufferMinutes * 60 * 1000).toISOString();
            })()
          : new Date(endAt.getTime()).toISOString();

      const { data: bookingId, error: rpcError } = await supabaseAdmin.rpc("create_booking_with_locking", {
        p_booking_data: bookingData,
        p_booking_services: pBookingServices,
        p_staff_id: staffId,
        p_start_at: startAt.toISOString(),
        p_end_at: pEndAt,
        p_entitlement_id: null,
        p_entitlement_customer_id: null,
        p_resource_ids: requiredResourceIds.length > 0 ? requiredResourceIds : null,
        p_resource_start_at: requiredResourceIds.length > 0 ? startAt.toISOString() : null,
        p_resource_end_at: requiredResourceIds.length > 0 ? endAt.toISOString() : null,
      });

      if (rpcError) {
        const msg = (rpcError as { message?: string }).message ?? "";
        if (msg.includes("BOOKING_SLOT_CONFLICT")) {
          return errorResponse(
            "This time slot is no longer available. Please select another time.",
            "CONFLICT",
            409
          );
        }
        if (msg.includes("RESOURCE_CONFLICT")) {
          return errorResponse(
            "A required resource (room/equipment) is not available at this time. Please select another time or remove the resource requirement.",
            "RESOURCE_CONFLICT",
            409
          );
        }
        console.error("RPC create_booking_with_locking error:", rpcError);
        throw new Error(`Database error: ${msg}`);
      }
      if (!bookingId) {
        throw new Error("Failed to create booking: No data returned from database");
      }

      // Fetch created booking and set provider-only fields not in RPC
      const { data: createdBooking, error: fetchErr } = await supabaseAdmin
        .from("bookings")
        .update({
          booking_source: bookingSource,
          referral_source_id: referralSourceId,
          discount_reason: body.discount_reason ?? null,
          ...(providerFormResponses ? { provider_form_responses: providerFormResponses } : {}),
        })
        .eq("id", bookingId)
        .select(
          `
          *,
          customers:users!bookings_customer_id_fkey(id, full_name, email, phone),
          locations:provider_locations(id, name, address_line1, city)
        `
        )
        .single();

      if (fetchErr || !createdBooking) {
        console.error("Failed to fetch/update booking after RPC:", fetchErr);
        throw new Error("Failed to create booking");
      }
      booking = createdBooking;
      console.log("Booking created successfully via RPC:", booking.id);
    } else {
      // Direct insert: still enforce booking conflicts unless double-booking override (holds already checked).
      if (!allowOverride) {
        if (staffId) {
          const directConflict = await checkBookingConflict(
            supabaseAdmin as any,
            staffId,
            startAt,
            endAt,
            0
          );
          if (directConflict.hasConflict) {
            return errorResponse(
              "This time slot is no longer available. Please select another time.",
              "CONFLICT",
              409
            );
          }
        } else {
          const provConflict = await checkBookingConflictForProvider(
            supabaseAdmin as any,
            providerId,
            startAt,
            endAt,
            0
          );
          if (provConflict.hasConflict) {
            return errorResponse(
              "This time slot is no longer available. Please select another time.",
              "CONFLICT",
              409
            );
          }
        }

        const directCalBlock = await isProviderCalendarWindowBlocked(supabaseAdmin as any, {
          providerId,
          locationId: body.location_id ?? undefined,
          staffId: staffId ?? null,
          startAt,
          endAt,
        });
        if (directCalBlock.blocked) {
          return errorResponse(
            directCalBlock.reason || "This time slot conflicts with a time block, day off, or is outside working hours.",
            "CALENDAR_BLOCK",
            409,
          );
        }
      }

      // Direct insert (no staff, or provider allows double-booking override)
      console.log("Inserting booking with data:", JSON.stringify(bookingData, null, 2));
      const { data: insertedBooking, error } = await supabaseAdmin
        .from("bookings")
        .insert(bookingData)
        .select(`
          *,
          customers:users!bookings_customer_id_fkey(id, full_name, email, phone),
          locations:provider_locations(id, name, address_line1, city)
        `)
        .single();

      if (error) {
        console.error("Error inserting booking:", error);
        console.error("Error details:", JSON.stringify(error, null, 2));
        throw new Error(`Database error: ${error.message || JSON.stringify(error)}`);
      }
      if (!insertedBooking) {
        console.error("No booking returned from insert");
        throw new Error("Failed to create booking: No data returned from database");
      }
      booking = insertedBooking;
      console.log("Booking created successfully:", booking.id);

      // Create booking_services records when not using RPC
      if (body.services && Array.isArray(body.services) && body.services.length > 0) {
        const bookingServicesData = body.services.map((service: any) => {
          const startAtS = service.scheduled_start_at || booking.scheduled_at;
          const duration = service.duration || service.duration_minutes || 60;
          const start = new Date(startAtS);
          const end = new Date(start.getTime() + duration * 60 * 1000);
          return {
            booking_id: booking.id,
            offering_id: service.serviceId || service.service_id || service.offering_id,
            staff_id: service.staffId || service.staff_id || body.team_member_id || body.staff_id || null,
            duration_minutes: duration,
            price: service.price || 0,
            currency: service.currency || lastResortCurrency,
            scheduled_start_at: start.toISOString(),
            scheduled_end_at: end.toISOString(),
          };
        });
        const { error: bsError } = await supabaseAdmin.from("booking_services").insert(bookingServicesData);
        if (bsError) {
          console.error("Error creating booking_services:", bsError);
        } else {
          console.log("Booking services created:", bookingServicesData.length);
        }
      } else if (body.service_id || body.offering_id) {
        const offeringId = body.offering_id || body.service_id;
        const duration = body.duration_minutes || 60;
        const start = new Date(booking.scheduled_at);
        const end = new Date(start.getTime() + duration * 60 * 1000);
        const bookingServiceData = {
          booking_id: booking.id,
          offering_id: offeringId,
          staff_id: body.team_member_id || body.staff_id || null,
          duration_minutes: duration,
          price: body.price || 0,
          currency: body.currency || lastResortCurrency,
          scheduled_start_at: start.toISOString(),
          scheduled_end_at: end.toISOString(),
        };
        const { error: bsError } = await supabaseAdmin.from("booking_services").insert(bookingServiceData);
        if (bsError) console.error("Error creating booking_services:", bsError);
      }
    }

    // Create addons / products / notification (shared for both paths)
    if (body.services && Array.isArray(body.services) && body.services.length > 0) {

      // Persist add-ons to booking_addons (addon_id = offering id, price from offerings)
      const addonIds = (body.services || [])
        .flatMap((s: any) => (Array.isArray(s.add_on_ids) ? s.add_on_ids : []))
        .filter(Boolean);
      if (addonIds.length > 0) {
        const { data: addonOfferings } = await supabaseAdmin
          .from("offerings")
          .select("id, price")
          .in("id", addonIds);
        const priceByAddonId = new Map((addonOfferings || []).map((o: any) => [o.id, Number(o.price || 0)]));
        const bookingAddonsData = addonIds.map((addonId: string) => ({
          booking_id: booking.id,
          addon_id: addonId,
          quantity: 1,
          price: priceByAddonId.get(addonId) ?? 0,
          currency: body.currency || lastResortCurrency,
        }));
        const { error: baError } = await supabaseAdmin
          .from("booking_addons")
          .insert(bookingAddonsData);
        if (baError) {
          console.error("Error creating booking_addons:", baError);
        }
      }
    }

    // Create booking_products records for each product
    if (body.products && Array.isArray(body.products) && body.products.length > 0) {
      const primaryStaffId = body.team_member_id || body.staff_id || null;
      const bookingProductsData = body.products.map((product: any) => ({
        booking_id: booking.id,
        product_id: product.productId || product.product_id,
        product_variant_id: product.productVariantId ?? null,
        quantity: product.quantity || 1,
        unit_price: product.unitPrice || product.unit_price || 0,
        total_price: product.totalPrice || product.total_price || (product.unitPrice || product.unit_price || 0) * (product.quantity || 1),
        staff_id: primaryStaffId,
      }));

      const { error: bpError } = await supabaseAdmin
        .from("booking_products")
        .insert(bookingProductsData);

      if (bpError) {
        console.error("Error creating booking_products:", bpError);
        // Don't fail the booking creation, just log the error
      } else {
        console.log("Booking products created:", bookingProductsData.length);
      }
    }

    // Record a booking_payments row for cash payments so that:
    // 1. The update_booking_payment_status trigger sets total_paid correctly
    // 2. The create_finance_ledger_from_payment trigger creates finance_transactions
    // 3. End-of-day reports (which query booking_payments) include this revenue
    // 4. Payout balance calculations (which use finance_transactions) are accurate
    if (body.payment_method === "cash" && finalTotalAmount > 0) {
      const cashAmount = body.payment_option === "deposit" && body.deposit_amount
        ? Number(body.deposit_amount)
        : finalTotalAmount;
      const { error: paymentRowError } = await supabaseAdmin
        .from("booking_payments")
        .insert({
          booking_id: booking.id,
          amount: cashAmount,
          payment_method: "cash",
          payment_provider: "cash",
          status: "completed",
          notes: body.payment_option === "deposit"
            ? `Cash deposit collected at booking creation (${body.deposit_percentage ?? 0}%)`
            : "Cash payment recorded at booking creation",
          created_by: user.id,
          ...(tenantId ? { tenant_id: tenantId } : {}),
        });
      if (paymentRowError) {
        console.warn("Failed to insert booking_payments row for cash:", paymentRowError);
      }
    }

    // Resource allocation: if the RPC path was used and resources were passed, they are already
    // allocated atomically inside the transaction. For the non-RPC path (or if pre-computation
    // failed), fall back to post-commit assignment with warnings.
    const resourceWarnings: string[] = [];
    const resourcesAllocatedViaRpc = useRpcPath && requiredResourceIds.length > 0;
    if (!resourcesAllocatedViaRpc && requiredResourceIds.length > 0) {
      try {
        const { checkResourceAvailability, assignResourcesToBooking } =
          await import("@/lib/resources/assignment");
        const resourceCheck = await checkResourceAvailability(
          supabaseAdmin as any,
          requiredResourceIds,
          startAt,
          endAt,
          booking.id,
        );
        if (resourceCheck.available) {
          const assignments = requiredResourceIds.map((rid) => ({
            booking_id: booking.id,
            resource_id: rid,
            scheduled_start_at: startAt.toISOString(),
            scheduled_end_at: endAt.toISOString(),
          }));
          await assignResourcesToBooking(supabaseAdmin as any, assignments);
        } else {
          const conflictIds = resourceCheck.conflicts.map((c) => c.resource_id);
          let conflictNames = "";
          if (conflictIds.length > 0) {
            const { data: names } = await supabaseAdmin
              .from("resources")
              .select("id, name")
              .in("id", conflictIds);
            conflictNames = (names || []).map((n) => n.name).filter(Boolean).join(", ");
          }
          resourceWarnings.push(
            conflictNames
              ? `Required resources unavailable: ${conflictNames}. Assign manually from the booking details.`
              : "One or more required resources (room/equipment) are unavailable at this time. Assign manually from the booking details."
          );
        }
      } catch (resourceErr) {
        console.warn("Resource auto-assignment skipped:", resourceErr);
        resourceWarnings.push("Resource assignment could not be completed automatically. Check resource availability manually.");
      }
    }

    // Transform to match Booking type (partial row → full Booking shape at runtime)
    const transformedBooking = {
      id: booking.id,
      booking_number: booking.booking_number,
      customer_id: booking.customer_id,
      provider_id: booking.provider_id,
      status: mapStatusFromDatabase(booking.status) as Booking["status"],
      location_type: booking.location_type,
      location_id: booking.location_id,
      // Construct address object from individual columns
      address: booking.address_line1 ? {
        line1: booking.address_line1,
        line2: booking.address_line2,
        city: booking.address_city,
        state: booking.address_state,
        country: booking.address_country,
        postal_code: booking.address_postal_code,
      } : null,
      scheduled_at: booking.scheduled_at,
      completed_at: booking.completed_at || null,
      cancelled_at: booking.cancelled_at || null,
      cancellation_reason: booking.cancellation_reason || null,
      // Services are fetched from booking_services table, passed via body.services for the response
      services: body.services || [],
      addons: body.addons || [],
      package_id: booking.package_id || null,
      subtotal: booking.subtotal || 0,
      tip_amount: booking.tip_amount || 0,
      total_amount: booking.total_amount || 0,
      currency: booking.currency || lastResortCurrency,
      payment_status: booking.payment_status,
      payment_method: null, // payment_method is not a column, it's payment_method_id
      special_requests: booking.special_requests || null,
      loyalty_points_earned: booking.loyalty_points_earned || 0,
      created_at: booking.created_at,
      updated_at: booking.updated_at,
    } as unknown as Booking;

    // Notify customer unless provider explicitly opted out via send_notification: false
    const shouldNotify = body.send_notification !== false;
    if (shouldNotify) {
      void import("@/lib/notifications/insert-notification").then(({ insertNotification }) =>
        insertNotification({
          user_id: customerId,
          type: "new_appointment",
          title: "New Appointment Created",
          message: `An appointment has been created for you. Booking ${booking.booking_number || booking.id.slice(0, 8)}.`,
          data: {
            booking_id: booking.id,
            booking_number: booking.booking_number,
            provider_id: providerId,
          },
          action_url: `/account-settings/bookings/${booking.id}`,
        })
      );

      void import("@/lib/notifications/notification-service").then(({ notifyBookingConfirmed }) =>
        notifyBookingConfirmed(booking.id, ['email', 'push'])
          .catch((e) => console.warn("Booking confirmation notification:", e))
      );
    }

    void import("@/lib/subscriptions/subscription-limit-notifications")
      .then((m) => m.maybeNotifyProviderSubscriptionLimits(providerId))
      .catch((e) => console.warn("Subscription usage notification:", e));

    const responsePayload: any = transformedBooking;
    if (resourceWarnings.length > 0) {
      responsePayload._warnings = resourceWarnings;
    }
    return successResponse(responsePayload);
  } catch (error) {
    return handleApiError(error, "Failed to create booking");
  }
}

export async function GET(request: NextRequest) {
  return withRouteMetrics(request, "/api/provider/bookings", "GET", () => handleGetProviderBookings(request));
}

export async function POST(request: NextRequest) {
  return withRouteMetrics(request, "/api/provider/bookings", "POST", () => handleCreateProviderBooking(request));
}