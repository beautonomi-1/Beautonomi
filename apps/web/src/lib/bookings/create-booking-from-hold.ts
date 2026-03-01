/**
 * Create a booking from a consumed hold
 * Used by /api/public/booking-holds/[id]/consume
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { determineAppointmentStatusFromDB } from "@/lib/provider-portal/appointment-settings";
import { lockBookingServices } from "./conflict-check";

export interface HoldConsumeInput {
  holdId: string;
  customerId: string;
  clientInfo: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    specialRequests?: string;
  };
  paymentMethod: "card" | "cash";
}

export interface CreateBookingFromHoldResult {
  bookingId: string;
  bookingNumber: string;
}

export async function createBookingFromHold(
  supabase: SupabaseClient,
  adminSupabase: SupabaseClient,
  hold: {
    id: string;
    provider_id: string;
    staff_id: string | null;
    booking_services_snapshot: any[];
    start_at: string;
    end_at: string;
    location_type: string;
    location_id: string | null;
    address_snapshot: any;
  },
  input: HoldConsumeInput
): Promise<CreateBookingFromHoldResult> {
  const services = hold.booking_services_snapshot as Array<{
    offering_id: string;
    staff_id: string | null;
    duration_minutes: number;
    price: number;
    currency: string;
    scheduled_start_at: string;
    scheduled_end_at: string;
  }>;

  if (!services.length) {
    throw new Error("Hold has no services");
  }

  const staffId = hold.staff_id ?? services[0]?.staff_id;
  if (!staffId) {
    throw new Error("Staff ID required for booking");
  }

  const currency = services[0]?.currency || "ZAR";
  const subtotal = services.reduce((sum, s) => sum + Number(s.price || 0), 0);

  // Load provider for tax/fee defaults
  const { data: provider, error: provErr } = await supabase
    .from("providers")
    .select("id, currency, tax_rate_percent, customer_fee_config_id, tips_enabled")
    .eq("id", hold.provider_id)
    .single();

  if (provErr || !provider) {
    throw new Error("Provider not found");
  }

  let taxRate = Number((provider as any)?.tax_rate_percent || 0);
  if (taxRate === 0) {
    const { getPlatformDefaultTaxRate } = await import("@/lib/platform-tax-settings");
    taxRate = await getPlatformDefaultTaxRate();
  }
  const taxAmount = taxRate > 0 ? Number(((subtotal * taxRate) / 100).toFixed(2)) : 0;

  let serviceFeeAmount = 0;
  let serviceFeePercentage = 0;
  if ((provider as any)?.customer_fee_config_id) {
    const { data: feeConfig } = await supabase
      .from("platform_fee_config")
      .select("id, fee_type, fee_percentage, fee_fixed_amount")
      .eq("id", (provider as any).customer_fee_config_id)
      .eq("is_active", true)
      .single();
    if (feeConfig) {
      if (feeConfig.fee_type === "percentage") {
        serviceFeePercentage = Number(feeConfig.fee_percentage || 0);
        serviceFeeAmount = Number(((subtotal * serviceFeePercentage) / 100).toFixed(2));
      } else {
        serviceFeeAmount = Number(feeConfig.fee_fixed_amount || 0);
      }
    }
  }

  const totalAmount = subtotal + taxAmount + serviceFeeAmount;
  const appointmentStatus = await determineAppointmentStatusFromDB(adminSupabase, hold.provider_id);

  const startAt = new Date(hold.start_at);
  const endAt = new Date(hold.end_at);

  // Re-check conflict before creating (slot may have been taken)
  const conflictResult = await lockBookingServices(
    supabase as any,
    staffId,
    startAt,
    endAt,
    15
  );
  if (conflictResult.hasConflict) {
    throw new Error("This time slot is no longer available. Please select another time.");
  }

  const bookingData: Record<string, any> = {
    customer_id: input.customerId,
    provider_id: hold.provider_id,
    status: appointmentStatus,
    location_type: hold.location_type,
    location_id: hold.location_id || null,
    scheduled_at: hold.start_at,
    subtotal,
    travel_fee: 0,
    service_fee_percentage: serviceFeePercentage,
    service_fee_amount: serviceFeeAmount,
    service_fee_paid_by: "customer",
    tip_amount: 0,
    tax_amount: taxAmount,
    discount_amount: 0,
    promotion_discount_amount: 0,
    membership_discount_amount: 0,
    total_amount: totalAmount,
    currency: currency,
    payment_status: input.paymentMethod === "cash" ? "pending" : "pending",
    special_requests: input.clientInfo.specialRequests || null,
    loyalty_points_earned: 0,
  };

  if (hold.location_type === "at_home" && hold.address_snapshot) {
    const addr = hold.address_snapshot as any;
    bookingData.address_line1 = addr.line1 || addr.address_line1;
    bookingData.address_line2 = addr.line2 || addr.address_line2 || null;
    bookingData.address_city = addr.city || addr.address_city;
    bookingData.address_state = addr.state || addr.address_state || null;
    bookingData.address_country = addr.country || addr.address_country;
    bookingData.address_postal_code = addr.postal_code || addr.postalCode || null;
    bookingData.address_latitude = addr.latitude ?? addr.lat ?? null;
    bookingData.address_longitude = addr.longitude ?? addr.lng ?? null;
  }

  const { data: bookingId, error: rpcError } = await adminSupabase.rpc("create_booking_with_locking", {
    p_booking_data: bookingData,
    p_booking_services: services,
    p_staff_id: staffId,
    p_start_at: hold.start_at,
    p_end_at: hold.end_at,
  });

  if (rpcError) {
    const msg = (rpcError as { message?: string }).message ?? "";
    if (msg.includes("BOOKING_SLOT_CONFLICT")) {
      throw new Error("This time slot is no longer available. Please select another time.");
    }
    throw rpcError;
  }
  if (!bookingId) throw new Error("Failed to create booking");

  const { data: booking } = await adminSupabase
    .from("bookings")
    .select("booking_number")
    .eq("id", bookingId)
    .single();

  return {
    bookingId,
    bookingNumber: (booking as any)?.booking_number || String(bookingId).slice(0, 8),
  };
}
