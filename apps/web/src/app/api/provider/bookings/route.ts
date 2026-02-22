import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError, errorResponse, normalizePhoneToE164 } from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { checkBookingLimitsFeatureAccess } from "@/lib/subscriptions/feature-access";
import type { Booking } from "@/types/beautonomi";
import { determineAppointmentStatusFromDB } from "@/lib/provider-portal/appointment-settings";

import { mapStatusToProvider } from "@/lib/utils/booking-status";

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
export async function GET(request: NextRequest) {
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

    let query = supabaseAdmin
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
          currency,
          scheduled_start_at,
          scheduled_end_at,
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
          quantity,
          unit_price,
          total_price,
          products:products!booking_products_product_id_fkey(id, name, retail_price)
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

    // Note: team_member_id filtering is done client-side in the API client
    // because staff_id is stored in booking_services (child table), not directly in bookings

    const { data: bookings, error } = await query
      .order("scheduled_at", { ascending: false });

    if (error) {
      throw error;
    }

    // Transform to match Booking type
    const transformedBookings = (bookings || []).map((booking: any) => {
      // Transform booking_services to include staff info for calendar filtering
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
        currency: bs.currency || "ZAR",
        scheduled_start_at: bs.scheduled_start_at,
        scheduled_end_at: bs.scheduled_end_at,
      }));

      // Transform booking_products for front desk and calendar display
      const products = (booking.booking_products || []).map((bp: any) => ({
        id: bp.id,
        product_id: bp.product_id,
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
        services: services,
        products: products,
        addons: [], // Addons would need to be fetched from booking_addons table
        package_id: booking.package_id || null,
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
        currency: booking.currency || "ZAR",
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
      };
    });

    const response = successResponse(transformedBookings as Booking[]);
    
    // Add cache headers for faster subsequent requests (5 seconds)
    response.headers.set('Cache-Control', 'private, max-age=5, stale-while-revalidate=10');
    
    return response;
  } catch (error) {
    return handleApiError(error, "Failed to fetch bookings");
  }
}

/**
 * POST /api/provider/bookings
 * 
 * Create a new booking/appointment
 */
export async function POST(request: NextRequest) {
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

    // Get provider ID
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

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

    // Get effective tax rate if not provided: provider tax_rate_percent → platform default → 15% fallback
    let effectiveTaxRate = body.tax_rate;
    if (!effectiveTaxRate || effectiveTaxRate === 0) {
      const { getEffectiveTaxRate } = await import("@/lib/platform-tax-settings");
      effectiveTaxRate = await getEffectiveTaxRate(providerId);
    }

    // Determine location_id: use provided value, or default to provider's first location for at_salon bookings
    let locationId = body.location_id || null;
    if (!locationId && (body.location_type === "at_salon" || !body.location_type)) {
      // For at_salon bookings, try to get the provider's default location or first location
      const { data: providerLocations } = await supabaseAdmin
        .from("provider_locations")
        .select("id")
        .eq("provider_id", providerId)
        .order("created_at", { ascending: true })
        .limit(1);
      
      if (providerLocations && providerLocations.length > 0) {
        locationId = providerLocations[0].id;
        console.log(`Using default location ${locationId} for walk-in booking`);
      }
    }

    // Determine booking source: if created by provider (this API), it's walk_in
    // Online bookings are created via /api/public/bookings or /api/me/bookings
    const bookingSource = body.booking_source || 'walk_in'; // Provider-created = walk_in
    
    // For walk-in bookings, set service fee to 0 (platform doesn't charge for direct customers)
    const isWalkIn = bookingSource === 'walk_in';
    const serviceFeeAmount = isWalkIn ? 0 : (body.service_fee_amount || 0);
    const serviceFeePercentage = isWalkIn ? 0 : (body.service_fee_percentage || 0);

    // Prepare booking data - only include columns that exist in the bookings table
    // Note: services and addons are stored in separate tables (booking_services, booking_addons)
    const bookingData: any = {
      provider_id: providerId,
      customer_id: customerId,
      booking_number: bookingNumber,
      scheduled_at: body.scheduled_at,
      location_type: body.location_type || "at_salon",
      location_id: locationId,
      booking_source: bookingSource, // 'walk_in' for provider-created, 'online' for client portal
      // Address fields (only for at_home bookings)
      address_line1: body.address?.line1 || body.address_line1 || null,
      address_line2: body.address?.line2 || body.address_line2 || null,
      address_city: body.address?.city || body.address_city || null,
      address_state: body.address?.state || body.address_state || null,
      address_country: body.address?.country || body.address_country || null,
      address_postal_code: body.address?.postal_code || body.address_postal_code || null,
      package_id: body.package_id || null,
      subtotal: body.subtotal || 0,
      discount_amount: body.discount_amount || 0,
      discount_code: body.discount_code || null,
      discount_reason: body.discount_reason || null,
      tax_amount: body.tax_amount || 0,
      tax_rate: effectiveTaxRate, // Store the effective tax rate
      tip_amount: body.tip_amount || 0,
      total_amount: body.total_amount || body.subtotal || 0,
      currency: body.currency || "ZAR",
      status: mapStatusToDatabase(finalStatus),
      payment_status: "pending",
      special_requests: body.special_requests || null,
      loyalty_points_earned: 0,
      travel_fee: body.travel_fee || 0,
      service_fee_percentage: serviceFeePercentage,
      service_fee_amount: serviceFeeAmount,
      service_fee_paid_by: isWalkIn ? null : (body.service_fee_paid_by || 'customer'),
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

    // Insert booking (use admin client to bypass RLS for provider-created bookings)
    console.log("Inserting booking with data:", JSON.stringify(bookingData, null, 2));
    const { data: booking, error } = await supabaseAdmin
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

    if (!booking) {
      console.error("No booking returned from insert");
      throw new Error("Failed to create booking: No data returned from database");
    }

    console.log("Booking created successfully:", booking.id);

    // Create booking_services records for each service (required for calendar display)
    // Support both old format (offering_id) and new format (serviceId)
    if (body.services && Array.isArray(body.services) && body.services.length > 0) {
      const bookingServicesData = body.services.map((service: any) => {
        const startAt = service.scheduled_start_at || booking.scheduled_at;
        const duration = service.duration || service.duration_minutes || 60;
        const start = new Date(startAt);
        const end = new Date(start.getTime() + duration * 60 * 1000);
        return {
          booking_id: booking.id,
          offering_id: service.serviceId || service.service_id || service.offering_id,
          staff_id: service.staffId || service.staff_id || body.team_member_id || body.staff_id || null,
          duration_minutes: duration,
          price: service.price || 0,
          currency: service.currency || "ZAR",
          scheduled_start_at: start.toISOString(),
          scheduled_end_at: end.toISOString(),
        };
      });

      const { error: bsError } = await supabaseAdmin
        .from("booking_services")
        .insert(bookingServicesData);

      if (bsError) {
        console.error("Error creating booking_services:", bsError);
        // Don't fail the booking creation, just log the error
      } else {
        console.log("Booking services created:", bookingServicesData.length);
      }
    } else if (body.service_id || body.offering_id) {
      // Fallback: Create single service from legacy format
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
        currency: body.currency || "ZAR",
        scheduled_start_at: start.toISOString(),
        scheduled_end_at: end.toISOString(),
      };

      const { error: bsError } = await supabaseAdmin
        .from("booking_services")
        .insert(bookingServiceData);

      if (bsError) {
        console.error("Error creating booking_services:", bsError);
      }
    }

    // Create booking_products records for each product
    if (body.products && Array.isArray(body.products) && body.products.length > 0) {
      const primaryStaffId = body.team_member_id || body.staff_id || null;
      const bookingProductsData = body.products.map((product: any) => ({
        booking_id: booking.id,
        product_id: product.productId || product.product_id,
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

    // Transform to match Booking type
    const transformedBooking: Booking = {
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
      currency: booking.currency || "ZAR",
      payment_status: booking.payment_status,
      payment_method: null, // payment_method is not a column, it's payment_method_id
      special_requests: booking.special_requests || null,
      loyalty_points_earned: booking.loyalty_points_earned || 0,
      created_at: booking.created_at,
      updated_at: booking.updated_at,
    };

    // Notify customer that provider created a booking for them
    try {
      await supabaseAdmin.from("notifications").insert({
        user_id: customerId,
        type: "new_appointment",
        title: "New Appointment Created",
        message: `An appointment has been created for you. Booking ${booking.booking_number || booking.id.slice(0, 8)}.`,
        metadata: {
          booking_id: booking.id,
          booking_number: booking.booking_number,
          provider_id: providerId,
        },
        link: `/account-settings/bookings/${booking.id}`,
      });
    } catch (notifError) {
      // Log but don't fail the request
      console.warn("Failed to create customer notification for new booking:", notifError);
    }

    return successResponse(transformedBooking);
  } catch (error) {
    return handleApiError(error, "Failed to create booking");
  }
}