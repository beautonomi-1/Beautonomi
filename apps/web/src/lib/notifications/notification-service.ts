/**
 * Notification Service
 * 
 * Comprehensive service for triggering all notification templates
 * This service provides functions for every notification scenario in the platform
 */

import { sendTemplateNotification, type NotificationChannel } from "./onesignal";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * Helper to get user IDs from booking data
 */
async function _getBookingUserIds(bookingId: string): Promise<{ customerId: string; providerId: string | null }> {
  const supabase = getSupabaseAdmin();
  const { data: booking } = await supabase
    .from("bookings")
    .select("customer_id, provider_id")
    .eq("id", bookingId)
    .single();
  
  return {
    customerId: booking?.customer_id || "",
    providerId: booking?.provider_id || null,
  };
}

/**
 * Helper to get booking details
 */
async function getBookingDetails(bookingId: string): Promise<any> {
  const supabase = getSupabaseAdmin();
  const { data: booking } = await supabase
    .from("bookings")
    .select(`
      *,
      customer:users!bookings_customer_id_fkey(id, full_name, email, phone),
      provider:providers!bookings_provider_id_fkey(id, business_name, user_id),
      booking_services(
        *,
        offerings!inner(
          title,
          price,
          duration_minutes
        )
      )
    `)
    .eq("id", bookingId)
    .single();
  
  // Transform booking_services to match expected format
  if (booking) {
    if (booking.booking_services && Array.isArray(booking.booking_services)) {
      booking.services = booking.booking_services.map((bs: any) => ({
        ...bs,
        service: {
          name: bs.offerings?.title || 'Service',
          price: bs.offerings?.price || 0,
          duration: bs.offerings?.duration_minutes || 60,
        },
      }));
    } else {
      // Fallback if booking_services is not loaded or empty
      booking.services = [];
    }
  }
  
  return booking;
}

/**
 * Helper to replace variables in URL
 */
function replaceUrlVariables(url: string, variables: Record<string, string>): string {
  let result = url;
  Object.entries(variables).forEach(([key, value]) => {
    result = result.replace(`{{${key}}}`, value);
  });
  return result;
}

// ============================================================================
// BOOKING NOTIFICATIONS
// ============================================================================

/**
 * Send booking confirmed notification
 */
export async function notifyBookingConfirmed(bookingId: string, channels?: NotificationChannel[]) {
  const booking = await getBookingDetails(bookingId);
  if (!booking) return { success: false, error: "Booking not found" };

  const variables = {
    provider_name: booking.provider?.business_name || "Provider",
    booking_date: new Date(booking.scheduled_at).toLocaleDateString(),
    booking_time: new Date(booking.scheduled_at).toLocaleTimeString(),
    services: booking.services?.map((s: any) => s.service?.name).join(", ") || "Services",
    total_amount: `ZAR ${booking.total_amount || 0}`,
    booking_number: booking.booking_number || bookingId,
    booking_id: bookingId,
  };

  const _url = replaceUrlVariables("/bookings/{{booking_id}}", variables);

  return await sendTemplateNotification(
    "booking_confirmed",
    [booking.customer_id],
    variables,
    channels
  );
}

/**
 * Send booking reminder (generic function that routes to appropriate reminder based on hours)
 */
export async function notifyBookingReminder(
  bookingId: string,
  hoursUntilAppointment: number,
  channels?: NotificationChannel[]
) {
  // Route to appropriate reminder function based on hours
  if (hoursUntilAppointment <= 2) {
    return await notifyBookingReminder2h(bookingId, channels);
  } else {
    return await notifyBookingReminder24h(bookingId, channels);
  }
}

/**
 * Send booking reminder (24 hours before)
 */
export async function notifyBookingReminder24h(bookingId: string, channels?: NotificationChannel[]) {
  const booking = await getBookingDetails(bookingId);
  if (!booking) return { success: false, error: "Booking not found" };

  const variables = {
    provider_name: booking.provider?.business_name || "Provider",
    booking_date: new Date(booking.scheduled_at).toLocaleDateString(),
    booking_time: new Date(booking.scheduled_at).toLocaleTimeString(),
    location: booking.location_type === "at_home" 
      ? booking.service_address || "Your location"
      : booking.provider?.business_name || "Salon",
    booking_id: bookingId,
  };

  const _url = replaceUrlVariables("/bookings/{{booking_id}}", variables);

  return await sendTemplateNotification(
    "booking_reminder_24h",
    [booking.customer_id],
    variables,
    channels
  );
}

/**
 * Send booking reminder (2 hours before)
 */
export async function notifyBookingReminder2h(bookingId: string, channels?: NotificationChannel[]) {
  const booking = await getBookingDetails(bookingId);
  if (!booking) return { success: false, error: "Booking not found" };

  const variables = {
    provider_name: booking.provider?.business_name || "Provider",
    booking_time: new Date(booking.scheduled_at).toLocaleTimeString(),
    location: booking.location_type === "at_home" 
      ? booking.service_address || "Your location"
      : booking.provider?.business_name || "Salon",
    booking_id: bookingId,
  };

  return await sendTemplateNotification(
    "booking_reminder_2h",
    [booking.customer_id],
    variables,
    channels
  );
}

/**
 * Send booking cancelled notification
 */
export async function notifyBookingCancelled(
  bookingId: string,
  cancelledBy: "customer" | "provider" | "system",
  refundInfo: string,
  channels?: NotificationChannel[]
) {
  const booking = await getBookingDetails(bookingId);
  if (!booking) return { success: false, error: "Booking not found" };

  const variables = {
    provider_name: booking.provider?.business_name || "Provider",
    booking_date: new Date(booking.scheduled_at).toLocaleDateString(),
    booking_number: booking.booking_number || bookingId,
    refund_info: refundInfo,
    booking_id: bookingId,
  };

  const templateKey = cancelledBy === "customer" 
    ? "booking_cancelled_by_customer"
    : cancelledBy === "provider"
    ? "booking_cancelled_by_provider"
    : "booking_cancelled";

  // Notify customer
  await sendTemplateNotification(templateKey, [booking.customer_id], variables, channels);

  // If cancelled by customer, notify provider
  if (cancelledBy === "customer" && booking.provider?.user_id) {
    await sendTemplateNotification(
      "provider_booking_cancelled",
      [booking.provider.user_id],
      {
        customer_name: booking.customer?.full_name || "Customer",
        booking_date: variables.booking_date,
        booking_time: new Date(booking.scheduled_at).toLocaleTimeString(),
        services: booking.services?.map((s: any) => s.service?.name).join(", ") || "Services",
        booking_id: bookingId,
      },
      channels
    );
  }

  return { success: true };
}

/**
 * Send booking rescheduled notification
 */
export async function notifyBookingRescheduled(
  bookingId: string,
  oldDate: Date,
  newDate: Date,
  channels?: NotificationChannel[]
) {
  const booking = await getBookingDetails(bookingId);
  if (!booking) return { success: false, error: "Booking not found" };

  const variables = {
    provider_name: booking.provider?.business_name || "Provider",
    new_date: newDate.toLocaleDateString(),
    new_time: newDate.toLocaleTimeString(),
    old_date: oldDate.toLocaleDateString(),
    old_time: oldDate.toLocaleTimeString(),
    booking_id: bookingId,
  };

  // Notify customer
  await sendTemplateNotification("booking_rescheduled", [booking.customer_id], variables, channels);

  // Notify provider
  if (booking.provider?.user_id) {
    await sendTemplateNotification(
      "provider_booking_rescheduled",
      [booking.provider.user_id],
      {
        customer_name: booking.customer?.full_name || "Customer",
        ...variables,
      },
      channels
    );
  }

  return { success: true };
}

// ============================================================================
// AT-HOME SERVICE NOTIFICATIONS
// ============================================================================

/**
 * Notify customer that provider is en route (at-home service)
 */
export async function notifyProviderEnRoute(bookingId: string, estimatedArrival: Date, channels?: NotificationChannel[]) {
  const booking = await getBookingDetails(bookingId);
  if (!booking || booking.location_type !== "at_home") {
    return { success: false, error: "Booking not found or not at-home service" };
  }

  const variables = {
    provider_name: booking.provider?.business_name || "Provider",
    estimated_arrival_time: estimatedArrival.toLocaleTimeString(),
    service_address: booking.service_address || "Your location",
    booking_id: bookingId,
  };

  return await sendTemplateNotification(
    "provider_en_route_home",
    [booking.customer_id],
    variables,
    channels
  );
}

/**
 * Notify customer that provider is arriving soon (at-home service)
 */
export async function notifyProviderArrivingSoon(bookingId: string, minutes: number, channels?: NotificationChannel[]) {
  const booking = await getBookingDetails(bookingId);
  if (!booking || booking.location_type !== "at_home") {
    return { success: false, error: "Booking not found or not at-home service" };
  }

  const variables = {
    provider_name: booking.provider?.business_name || "Provider",
    minutes: minutes.toString(),
    service_address: booking.service_address || "Your location",
    booking_id: bookingId,
  };

  return await sendTemplateNotification(
    "provider_arriving_soon_home",
    [booking.customer_id],
    variables,
    channels
  );
}

/**
 * Notify customer that provider has arrived (at-home service)
 */
export async function notifyProviderArrived(bookingId: string, channels?: NotificationChannel[]) {
  const booking = await getBookingDetails(bookingId);
  if (!booking || booking.location_type !== "at_home") {
    return { success: false, error: "Booking not found or not at-home service" };
  }

  const variables = {
    provider_name: booking.provider?.business_name || "Provider",
    service_address: booking.service_address || "Your location",
    booking_id: bookingId,
  };

  return await sendTemplateNotification(
    "provider_arrived_home",
    [booking.customer_id],
    variables,
    channels
  );
}

/**
 * Send home service location details
 */
export async function notifyHomeServiceLocationDetails(bookingId: string, channels?: NotificationChannel[]) {
  const booking = await getBookingDetails(bookingId);
  if (!booking || booking.location_type !== "at_home") {
    return { success: false, error: "Booking not found or not at-home service" };
  }

  const variables = {
    provider_name: booking.provider?.business_name || "Provider",
    service_address: booking.service_address || "",
    booking_date: new Date(booking.scheduled_at).toLocaleDateString(),
    booking_time: new Date(booking.scheduled_at).toLocaleTimeString(),
    special_instructions: booking.special_instructions || "None",
    booking_id: bookingId,
  };

  return await sendTemplateNotification(
    "home_service_location_details",
    [booking.customer_id],
    variables,
    channels
  );
}

/**
 * Request service location from customer (at-home service)
 */
export async function notifyServiceLocationRequired(bookingId: string, channels?: NotificationChannel[]) {
  const booking = await getBookingDetails(bookingId);
  if (!booking || booking.location_type !== "at_home") {
    return { success: false, error: "Booking not found or not at-home service" };
  }

  const variables = {
    provider_name: booking.provider?.business_name || "Provider",
    booking_date: new Date(booking.scheduled_at).toLocaleDateString(),
    booking_time: new Date(booking.scheduled_at).toLocaleTimeString(),
    booking_id: bookingId,
  };

  return await sendTemplateNotification(
    "home_service_location_required",
    [booking.customer_id],
    variables,
    channels
  );
}

/**
 * Notify customer that service location changed (at-home service)
 */
export async function notifyServiceLocationChanged(
  bookingId: string,
  oldAddress: string,
  newAddress: string,
  channels?: NotificationChannel[]
) {
  const booking = await getBookingDetails(bookingId);
  if (!booking) return { success: false, error: "Booking not found" };

  const variables = {
    provider_name: booking.provider?.business_name || "Provider",
    new_address: newAddress,
    old_address: oldAddress,
    booking_date: new Date(booking.scheduled_at).toLocaleDateString(),
    booking_time: new Date(booking.scheduled_at).toLocaleTimeString(),
    booking_id: bookingId,
  };

  return await sendTemplateNotification(
    "home_service_location_changed",
    [booking.customer_id],
    variables,
    channels
  );
}

/**
 * Notify customer that provider needs directions (at-home service)
 */
export async function notifyProviderNeedsDirections(bookingId: string, channels?: NotificationChannel[]) {
  const booking = await getBookingDetails(bookingId);
  if (!booking || booking.location_type !== "at_home") {
    return { success: false, error: "Booking not found or not at-home service" };
  }

  const variables = {
    provider_name: booking.provider?.business_name || "Provider",
    service_address: booking.service_address || "",
    booking_id: bookingId,
  };

  return await sendTemplateNotification(
    "provider_needs_directions",
    [booking.customer_id],
    variables,
    channels
  );
}

/**
 * Share provider live location (at-home service)
 */
export async function notifyProviderLocationShared(bookingId: string, trackingUrl: string, channels?: NotificationChannel[]) {
  const booking = await getBookingDetails(bookingId);
  if (!booking || booking.location_type !== "at_home") {
    return { success: false, error: "Booking not found or not at-home service" };
  }

  const variables = {
    provider_name: booking.provider?.business_name || "Provider",
    tracking_url: trackingUrl,
    booking_id: bookingId,
  };

  return await sendTemplateNotification(
    "provider_location_shared",
    [booking.customer_id],
    variables,
    channels
  );
}

// ============================================================================
// AT-SALON SERVICE NOTIFICATIONS
// ============================================================================

/**
 * Send salon directions to customer
 */
export async function notifySalonDirections(bookingId: string, channels?: NotificationChannel[]) {
  const booking = await getBookingDetails(bookingId);
  if (!booking || booking.location_type !== "at_salon") {
    return { success: false, error: "Booking not found or not at-salon service" };
  }

  const supabase = getSupabaseAdmin();
  const { data: location } = await supabase
    .from("provider_locations")
    .select("*")
    .eq("id", booking.location_id)
    .single();

  const variables = {
    provider_name: booking.provider?.business_name || "Provider",
    salon_name: location?.name || booking.provider?.business_name || "Salon",
    salon_address: location?.address || "",
    booking_date: new Date(booking.scheduled_at).toLocaleDateString(),
    booking_time: new Date(booking.scheduled_at).toLocaleTimeString(),
    parking_info: location?.parking_info || "Available",
    directions_url: `https://maps.google.com/?q=${encodeURIComponent(location?.address || "")}`,
    booking_id: bookingId,
  };

  return await sendTemplateNotification(
    "salon_directions",
    [booking.customer_id],
    variables,
    channels
  );
}

/**
 * Send salon arrival reminder
 */
export async function notifySalonArrivalReminder(bookingId: string, channels?: NotificationChannel[]) {
  const booking = await getBookingDetails(bookingId);
  if (!booking || booking.location_type !== "at_salon") {
    return { success: false, error: "Booking not found or not at-salon service" };
  }

  const supabase = getSupabaseAdmin();
  const { data: location } = await supabase
    .from("provider_locations")
    .select("*")
    .eq("id", booking.location_id)
    .single();

  const variables = {
    salon_name: location?.name || booking.provider?.business_name || "Salon",
    booking_time: new Date(booking.scheduled_at).toLocaleTimeString(),
    provider_name: booking.provider?.business_name || "Provider",
    salon_address: location?.address || "",
    booking_id: bookingId,
  };

  return await sendTemplateNotification(
    "salon_arrival_reminder",
    [booking.customer_id],
    variables,
    channels
  );
}

/**
 * Notify customer has arrived at salon
 */
export async function notifyCustomerArrivedSalon(bookingId: string, channels?: NotificationChannel[]) {
  const booking = await getBookingDetails(bookingId);
  if (!booking || booking.location_type !== "at_salon") {
    return { success: false, error: "Booking not found or not at-salon service" };
  }

  const supabase = getSupabaseAdmin();
  const { data: location } = await supabase
    .from("provider_locations")
    .select("*")
    .eq("id", booking.location_id)
    .single();

  const variables = {
    salon_name: location?.name || booking.provider?.business_name || "Salon",
    provider_name: booking.provider?.business_name || "Provider",
    booking_id: bookingId,
  };

  return await sendTemplateNotification(
    "customer_arrived_salon",
    [booking.customer_id],
    variables,
    channels
  );
}

/**
 * Notify customer about waiting area
 */
export async function notifyWaitingArea(bookingId: string, waitingArea: string, channels?: NotificationChannel[]) {
  const booking = await getBookingDetails(bookingId);
  if (!booking || booking.location_type !== "at_salon") {
    return { success: false, error: "Booking not found or not at-salon service" };
  }

  const supabase = getSupabaseAdmin();
  const { data: location } = await supabase
    .from("provider_locations")
    .select("*")
    .eq("id", booking.location_id)
    .single();

  const variables = {
    salon_name: location?.name || booking.provider?.business_name || "Salon",
    waiting_area: waitingArea,
    provider_name: booking.provider?.business_name || "Provider",
    booking_id: bookingId,
  };

  return await sendTemplateNotification(
    "salon_waiting_area",
    [booking.customer_id],
    variables,
    channels
  );
}

// ============================================================================
// SERVICE STATUS NOTIFICATIONS
// ============================================================================

/**
 * Notify service started
 */
export async function notifyServiceStarted(bookingId: string, serviceDuration: string, channels?: NotificationChannel[]) {
  const booking = await getBookingDetails(bookingId);
  if (!booking) return { success: false, error: "Booking not found" };

  const variables = {
    provider_name: booking.provider?.business_name || "Provider",
    service_duration: serviceDuration,
    booking_id: bookingId,
  };

  return await sendTemplateNotification(
    "service_started",
    [booking.customer_id],
    variables,
    channels
  );
}

/**
 * Notify service in progress
 */
export async function notifyServiceInProgress(bookingId: string, channels?: NotificationChannel[]) {
  const booking = await getBookingDetails(bookingId);
  if (!booking) return { success: false, error: "Booking not found" };

  const variables = {
    provider_name: booking.provider?.business_name || "Provider",
    booking_id: bookingId,
  };

  return await sendTemplateNotification(
    "service_in_progress",
    [booking.customer_id],
    variables,
    channels
  );
}

/**
 * Notify service almost done
 */
export async function notifyServiceAlmostDone(bookingId: string, remainingTime: string, channels?: NotificationChannel[]) {
  const booking = await getBookingDetails(bookingId);
  if (!booking) return { success: false, error: "Booking not found" };

  const variables = {
    provider_name: booking.provider?.business_name || "Provider",
    remaining_time: remainingTime,
    booking_id: bookingId,
  };

  return await sendTemplateNotification(
    "service_almost_done",
    [booking.customer_id],
    variables,
    channels
  );
}

/**
 * Notify service extended
 */
export async function notifyServiceExtended(
  bookingId: string,
  extensionTime: string,
  newEndTime: Date,
  additionalCharge: number,
  channels?: NotificationChannel[]
) {
  const booking = await getBookingDetails(bookingId);
  if (!booking) return { success: false, error: "Booking not found" };

  const variables = {
    provider_name: booking.provider?.business_name || "Provider",
    extension_time: extensionTime,
    new_end_time: newEndTime.toLocaleTimeString(),
    additional_charge: `ZAR ${additionalCharge}`,
    booking_id: bookingId,
  };

  return await sendTemplateNotification(
    "service_extended",
    [booking.customer_id],
    variables,
    channels
  );
}

/**
 * Notify service completed
 */
export async function notifyServiceCompleted(bookingId: string, channels?: NotificationChannel[]) {
  const booking = await getBookingDetails(bookingId);
  if (!booking) return { success: false, error: "Booking not found" };

  const variables = {
    provider_name: booking.provider?.business_name || "Provider",
    services: booking.services?.map((s: any) => s.service?.name).join(", ") || "Services",
    booking_id: bookingId,
  };

  return await sendTemplateNotification(
    "service_completed",
    [booking.customer_id],
    variables,
    channels
  );
}

// ============================================================================
// PROVIDER STATUS NOTIFICATIONS
// ============================================================================

/**
 * Notify customer that provider is running late
 */
export async function notifyProviderRunningLate(
  bookingId: string,
  delayMinutes: number,
  newArrivalTime: Date,
  channels?: NotificationChannel[]
) {
  const booking = await getBookingDetails(bookingId);
  if (!booking) return { success: false, error: "Booking not found" };

  const variables = {
    provider_name: booking.provider?.business_name || "Provider",
    delay_minutes: delayMinutes.toString(),
    new_arrival_time: newArrivalTime.toLocaleTimeString(),
    original_time: new Date(booking.scheduled_at).toLocaleTimeString(),
    booking_id: bookingId,
  };

  return await sendTemplateNotification(
    "provider_running_late",
    [booking.customer_id],
    variables,
    channels
  );
}

/**
 * Notify customer that provider arrived early
 */
export async function notifyProviderArrivedEarly(bookingId: string, channels?: NotificationChannel[]) {
  const booking = await getBookingDetails(bookingId);
  if (!booking) return { success: false, error: "Booking not found" };

  const variables = {
    provider_name: booking.provider?.business_name || "Provider",
    booking_id: bookingId,
  };

  return await sendTemplateNotification(
    "provider_arrived_early",
    [booking.customer_id],
    variables,
    channels
  );
}

// ============================================================================
// CUSTOMER STATUS NOTIFICATIONS
// ============================================================================

/**
 * Notify customer they are running late
 */
export async function notifyCustomerRunningLate(bookingId: string, channels?: NotificationChannel[]) {
  const booking = await getBookingDetails(bookingId);
  if (!booking) return { success: false, error: "Booking not found" };

  const locationName = booking.location_type === "at_home"
    ? booking.service_address || "Your location"
    : booking.provider?.business_name || "Salon";

  const variables = {
    booking_time: new Date(booking.scheduled_at).toLocaleTimeString(),
    provider_name: booking.provider?.business_name || "Provider",
    location_name: locationName,
    booking_id: bookingId,
  };

  return await sendTemplateNotification(
    "customer_running_late",
    [booking.customer_id],
    variables,
    channels
  );
}

/**
 * Notify customer about no-show
 */
export async function notifyCustomerNoShow(bookingId: string, noShowFee: number, channels?: NotificationChannel[]) {
  const booking = await getBookingDetails(bookingId);
  if (!booking) return { success: false, error: "Booking not found" };

  const variables = {
    provider_name: booking.provider?.business_name || "Provider",
    booking_date: new Date(booking.scheduled_at).toLocaleDateString(),
    booking_time: new Date(booking.scheduled_at).toLocaleTimeString(),
    no_show_fee: `ZAR ${noShowFee}`,
    booking_id: bookingId,
  };

  return await sendTemplateNotification(
    "customer_no_show",
    [booking.customer_id],
    variables,
    channels
  );
}

// ============================================================================
// PAYMENT NOTIFICATIONS
// ============================================================================

/**
 * Notify payment successful
 */
export async function notifyPaymentSuccessful(
  bookingId: string,
  amount: number,
  paymentMethod: string,
  transactionId: string,
  channels?: NotificationChannel[]
) {
  const booking = await getBookingDetails(bookingId);
  if (!booking) return { success: false, error: "Booking not found" };

  const variables = {
    amount: `ZAR ${amount}`,
    booking_number: booking.booking_number || bookingId,
    payment_method: paymentMethod,
    transaction_id: transactionId,
    booking_id: bookingId,
  };

  return await sendTemplateNotification(
    "payment_successful",
    [booking.customer_id],
    variables,
    channels
  );
}

/**
 * Notify payment failed
 */
export async function notifyPaymentFailed(
  bookingId: string,
  amount: number,
  failureReason: string,
  channels?: NotificationChannel[]
) {
  const booking = await getBookingDetails(bookingId);
  if (!booking) return { success: false, error: "Booking not found" };

  const variables = {
    amount: `ZAR ${amount}`,
    booking_number: booking.booking_number || bookingId,
    failure_reason: failureReason,
    booking_id: bookingId,
  };

  return await sendTemplateNotification(
    "payment_failed",
    [booking.customer_id],
    variables,
    channels
  );
}

/**
 * Notify payment pending
 */
export async function notifyPaymentPending(
  bookingId: string,
  amount: number,
  paymentMethod: string,
  channels?: NotificationChannel[]
) {
  const booking = await getBookingDetails(bookingId);
  if (!booking) return { success: false, error: "Booking not found" };

  const variables = {
    amount: `ZAR ${amount}`,
    booking_number: booking.booking_number || bookingId,
    payment_method: paymentMethod,
    booking_id: bookingId,
  };

  return await sendTemplateNotification(
    "payment_pending",
    [booking.customer_id],
    variables,
    channels
  );
}

/**
 * Notify payment method expired
 */
export async function notifyPaymentMethodExpired(bookingId: string, amount: number, channels?: NotificationChannel[]) {
  const booking = await getBookingDetails(bookingId);
  if (!booking) return { success: false, error: "Booking not found" };

  const variables = {
    booking_number: booking.booking_number || bookingId,
    amount: `ZAR ${amount}`,
    booking_id: bookingId,
  };

  return await sendTemplateNotification(
    "payment_method_expired",
    [booking.customer_id],
    variables,
    channels
  );
}

/**
 * Notify partial payment received
 */
export async function notifyPartialPayment(
  bookingId: string,
  partialAmount: number,
  remainingBalance: number,
  channels?: NotificationChannel[]
) {
  const booking = await getBookingDetails(bookingId);
  if (!booking) return { success: false, error: "Booking not found" };

  const variables = {
    partial_amount: `ZAR ${partialAmount}`,
    remaining_balance: `ZAR ${remainingBalance}`,
    booking_number: booking.booking_number || bookingId,
    booking_id: bookingId,
  };

  return await sendTemplateNotification(
    "partial_payment_received",
    [booking.customer_id],
    variables,
    channels
  );
}

/**
 * Notify refund processed
 */
export async function notifyRefundProcessed(
  bookingId: string,
  amount: number,
  refundReason: string,
  channels?: NotificationChannel[]
) {
  const booking = await getBookingDetails(bookingId);
  if (!booking) return { success: false, error: "Booking not found" };

  const variables = {
    amount: `ZAR ${amount}`,
    booking_number: booking.booking_number || bookingId,
    refund_reason: refundReason,
    booking_id: bookingId,
  };

  return await sendTemplateNotification(
    "refund_processed",
    [booking.customer_id],
    variables,
    channels
  );
}

/**
 * Notify invoice generated
 */
export async function notifyInvoiceGenerated(
  bookingId: string,
  totalAmount: number,
  invoiceNumber: string,
  channels?: NotificationChannel[]
) {
  const booking = await getBookingDetails(bookingId);
  if (!booking) return { success: false, error: "Booking not found" };

  const variables = {
    booking_number: booking.booking_number || bookingId,
    total_amount: `ZAR ${totalAmount}`,
    invoice_number: invoiceNumber,
    booking_id: bookingId,
  };

  return await sendTemplateNotification(
    "invoice_generated",
    [booking.customer_id],
    variables,
    channels
  );
}

/**
 * Notify receipt sent
 */
export async function notifyReceiptSent(
  bookingId: string,
  totalAmount: number,
  paymentDate: Date,
  channels?: NotificationChannel[]
) {
  const booking = await getBookingDetails(bookingId);
  if (!booking) return { success: false, error: "Booking not found" };

  const variables = {
    booking_number: booking.booking_number || bookingId,
    total_amount: `ZAR ${totalAmount}`,
    payment_date: paymentDate.toLocaleDateString(),
    booking_id: bookingId,
  };

  return await sendTemplateNotification(
    "receipt_sent",
    [booking.customer_id],
    variables,
    channels
  );
}

// ============================================================================
// PROVIDER BUSINESS NOTIFICATIONS
// ============================================================================

/**
 * Notify provider of new booking request
 */
export async function notifyProviderNewBooking(bookingId: string, channels?: NotificationChannel[]) {
  const booking = await getBookingDetails(bookingId);
  if (!booking || !booking.provider?.user_id) {
    return { success: false, error: "Booking or provider not found" };
  }

  const variables = {
    customer_name: booking.customer?.full_name || "Customer",
    booking_date: new Date(booking.scheduled_at).toLocaleDateString(),
    booking_time: new Date(booking.scheduled_at).toLocaleTimeString(),
    services: booking.services?.map((s: any) => s.service?.name).join(", ") || "Services",
    total_amount: `ZAR ${booking.total_amount || 0}`,
    booking_id: bookingId,
  };

  return await sendTemplateNotification(
    "provider_booking_request",
    [booking.provider.user_id],
    variables,
    channels
  );
}

/**
 * Notify provider of new customer (first booking)
 */
export async function notifyProviderNewCustomer(bookingId: string, channels?: NotificationChannel[]) {
  const booking = await getBookingDetails(bookingId);
  if (!booking || !booking.provider?.user_id) {
    return { success: false, error: "Booking or provider not found" };
  }

  // Check if this is customer's first booking with this provider
  const supabase = getSupabaseAdmin();
  const { count } = await supabase
    .from("bookings")
    .select("*", { count: "exact", head: true })
    .eq("customer_id", booking.customer_id)
    .eq("provider_id", booking.provider_id)
    .neq("status", "cancelled");

  if (count && count > 1) {
    // Not a new customer, skip
    return { success: true, skipped: true };
  }

  const variables = {
    customer_name: booking.customer?.full_name || "Customer",
    booking_date: new Date(booking.scheduled_at).toLocaleDateString(),
    booking_time: new Date(booking.scheduled_at).toLocaleTimeString(),
    services: booking.services?.map((s: any) => s.service?.name).join(", ") || "Services",
    booking_id: bookingId,
  };

  return await sendTemplateNotification(
    "provider_new_customer",
    [booking.provider.user_id],
    variables,
    channels
  );
}

/**
 * Notify provider of returning customer
 */
export async function notifyProviderReturningCustomer(bookingId: string, visitNumber: number, channels?: NotificationChannel[]) {
  const booking = await getBookingDetails(bookingId);
  if (!booking || !booking.provider?.user_id) {
    return { success: false, error: "Booking or provider not found" };
  }

  const variables = {
    customer_name: booking.customer?.full_name || "Customer",
    visit_number: visitNumber.toString(),
    booking_date: new Date(booking.scheduled_at).toLocaleDateString(),
    booking_time: new Date(booking.scheduled_at).toLocaleTimeString(),
    services: booking.services?.map((s: any) => s.service?.name).join(", ") || "Services",
    booking_id: bookingId,
  };

  return await sendTemplateNotification(
    "provider_recurring_customer",
    [booking.provider.user_id],
    variables,
    channels
  );
}

/**
 * Notify provider of preferred customer booking
 */
export async function notifyProviderPreferredCustomer(bookingId: string, totalBookings: number, channels?: NotificationChannel[]) {
  const booking = await getBookingDetails(bookingId);
  if (!booking || !booking.provider?.user_id) {
    return { success: false, error: "Booking or provider not found" };
  }

  const variables = {
    customer_name: booking.customer?.full_name || "Customer",
    booking_date: new Date(booking.scheduled_at).toLocaleDateString(),
    booking_time: new Date(booking.scheduled_at).toLocaleTimeString(),
    services: booking.services?.map((s: any) => s.service?.name).join(", ") || "Services",
    total_bookings: totalBookings.toString(),
    booking_id: bookingId,
  };

  return await sendTemplateNotification(
    "provider_preferred_customer",
    [booking.provider.user_id],
    variables,
    channels
  );
}

/**
 * Notify provider payout processed
 */
export async function notifyProviderPayoutProcessed(
  providerId: string,
  amount: number,
  payoutDate: Date,
  transactionId: string,
  channels?: NotificationChannel[]
) {
  const supabase = getSupabaseAdmin();
  const { data: provider } = await supabase
    .from("providers")
    .select("user_id")
    .eq("id", providerId)
    .single();

  if (!provider?.user_id) {
    return { success: false, error: "Provider not found" };
  }

  const variables = {
    amount: `ZAR ${amount}`,
    payout_date: payoutDate.toLocaleDateString(),
    transaction_id: transactionId,
  };

  return await sendTemplateNotification(
    "provider_payout_processed",
    [provider.user_id],
    variables,
    channels
  );
}

/**
 * Notify provider payout scheduled
 */
export async function notifyProviderPayoutScheduled(
  providerId: string,
  payoutAmount: number,
  payoutDate: Date,
  paymentMethod: string,
  channels?: NotificationChannel[]
) {
  const supabase = getSupabaseAdmin();
  const { data: provider } = await supabase
    .from("providers")
    .select("user_id")
    .eq("id", providerId)
    .single();

  if (!provider?.user_id) {
    return { success: false, error: "Provider not found" };
  }

  const variables = {
    payout_amount: `ZAR ${payoutAmount}`,
    payout_date: payoutDate.toLocaleDateString(),
    payment_method: paymentMethod,
  };

  return await sendTemplateNotification(
    "provider_payout_scheduled",
    [provider.user_id],
    variables,
    channels
  );
}

/**
 * Notify provider payout failed
 */
export async function notifyProviderPayoutFailed(
  providerId: string,
  payoutAmount: number,
  failureReason: string,
  channels?: NotificationChannel[]
) {
  const supabase = getSupabaseAdmin();
  const { data: provider } = await supabase
    .from("providers")
    .select("user_id")
    .eq("id", providerId)
    .single();

  if (!provider?.user_id) {
    return { success: false, error: "Provider not found" };
  }

  const variables = {
    payout_amount: `ZAR ${payoutAmount}`,
    failure_reason: failureReason,
  };

  return await sendTemplateNotification(
    "provider_payout_failed",
    [provider.user_id],
    variables,
    channels
  );
}

/**
 * Notify provider weekly earnings summary
 */
export async function notifyProviderWeeklyEarnings(
  providerId: string,
  totalEarnings: number,
  completedBookings: number,
  pendingPayout: number,
  payoutDate: Date,
  channels?: NotificationChannel[]
) {
  const supabase = getSupabaseAdmin();
  const { data: provider } = await supabase
    .from("providers")
    .select("user_id")
    .eq("id", providerId)
    .single();

  if (!provider?.user_id) {
    return { success: false, error: "Provider not found" };
  }

  const variables = {
    total_earnings: `ZAR ${totalEarnings}`,
    completed_bookings: completedBookings.toString(),
    pending_payout: `ZAR ${pendingPayout}`,
    payout_date: payoutDate.toLocaleDateString(),
  };

  return await sendTemplateNotification(
    "provider_earnings_summary",
    [provider.user_id],
    variables,
    channels
  );
}

/**
 * Notify provider availability changed
 */
export async function notifyProviderAvailabilityChanged(
  providerId: string,
  availabilityChanges: string,
  channels?: NotificationChannel[]
) {
  const supabase = getSupabaseAdmin();
  const { data: provider } = await supabase
    .from("providers")
    .select("user_id")
    .eq("id", providerId)
    .single();

  if (!provider?.user_id) {
    return { success: false, error: "Provider not found" };
  }

  const variables = {
    availability_changes: availabilityChanges,
  };

  return await sendTemplateNotification(
    "provider_availability_changed",
    [provider.user_id],
    variables,
    channels
  );
}

/**
 * Notify provider holiday mode activated
 */
export async function notifyProviderHolidayMode(
  providerId: string,
  startDate: Date,
  returnDate: Date,
  channels?: NotificationChannel[]
) {
  const supabase = getSupabaseAdmin();
  const { data: provider } = await supabase
    .from("providers")
    .select("user_id")
    .eq("id", providerId)
    .single();

  if (!provider?.user_id) {
    return { success: false, error: "Provider not found" };
  }

  const variables = {
    start_date: startDate.toLocaleDateString(),
    return_date: returnDate.toLocaleDateString(),
  };

  return await sendTemplateNotification(
    "provider_holiday_mode",
    [provider.user_id],
    variables,
    channels
  );
}

/**
 * Notify provider holiday mode ending soon
 */
export async function notifyProviderHolidayModeEnding(
  providerId: string,
  returnDate: Date,
  channels?: NotificationChannel[]
) {
  const supabase = getSupabaseAdmin();
  const { data: provider } = await supabase
    .from("providers")
    .select("user_id")
    .eq("id", providerId)
    .single();

  if (!provider?.user_id) {
    return { success: false, error: "Provider not found" };
  }

  const variables = {
    return_date: returnDate.toLocaleDateString(),
  };

  return await sendTemplateNotification(
    "provider_holiday_mode_ending",
    [provider.user_id],
    variables,
    channels
  );
}

/**
 * Notify provider break scheduled
 */
export async function notifyProviderBreakScheduled(
  providerId: string,
  breakStart: Date,
  breakEnd: Date,
  channels?: NotificationChannel[]
) {
  const supabase = getSupabaseAdmin();
  const { data: provider } = await supabase
    .from("providers")
    .select("user_id")
    .eq("id", providerId)
    .single();

  if (!provider?.user_id) {
    return { success: false, error: "Provider not found" };
  }

  const variables = {
    break_start: breakStart.toLocaleString(),
    break_end: breakEnd.toLocaleString(),
  };

  return await sendTemplateNotification(
    "provider_break_scheduled",
    [provider.user_id],
    variables,
    channels
  );
}

// ============================================================================
// REVIEW NOTIFICATIONS
// ============================================================================

/**
 * Send review reminder
 */
export async function notifyReviewReminder(bookingId: string, channels?: NotificationChannel[]) {
  const booking = await getBookingDetails(bookingId);
  if (!booking) return { success: false, error: "Booking not found" };

  const variables = {
    provider_name: booking.provider?.business_name || "Provider",
    booking_date: new Date(booking.scheduled_at).toLocaleDateString(),
    services: booking.services?.map((s: any) => s.service?.name).join(", ") || "Services",
    booking_id: bookingId,
  };

  return await sendTemplateNotification(
    "review_reminder",
    [booking.customer_id],
    variables,
    channels
  );
}

/**
 * Notify provider of new review
 */
export async function notifyProviderNewReview(
  reviewId: string,
  customerName: string,
  rating: number,
  reviewText: string,
  providerUserId: string,
  channels?: NotificationChannel[]
) {
  const variables = {
    customer_name: customerName,
    rating: rating.toString(),
    review_text: reviewText,
  };

  return await sendTemplateNotification(
    "provider_new_review",
    [providerUserId],
    variables,
    channels
  );
}

/**
 * Send booking follow-up for feedback
 */
export async function notifyBookingFollowUp(bookingId: string, channels?: NotificationChannel[]) {
  const booking = await getBookingDetails(bookingId);
  if (!booking) return { success: false, error: "Booking not found" };

  const variables = {
    provider_name: booking.provider?.business_name || "Provider",
    services: booking.services?.map((s: any) => s.service?.name).join(", ") || "Services",
    booking_date: new Date(booking.scheduled_at).toLocaleDateString(),
    booking_id: bookingId,
  };

  return await sendTemplateNotification(
    "booking_follow_up",
    [booking.customer_id],
    variables,
    channels
  );
}

/**
 * Send thank you message after service
 */
export async function notifyThankYouAfterService(bookingId: string, channels?: NotificationChannel[]) {
  const booking = await getBookingDetails(bookingId);
  if (!booking) return { success: false, error: "Booking not found" };

  const variables = {
    provider_name: booking.provider?.business_name || "Provider",
    services: booking.services?.map((s: any) => s.service?.name).join(", ") || "Services",
    booking_date: new Date(booking.scheduled_at).toLocaleDateString(),
  };

  return await sendTemplateNotification(
    "thank_you_after_service",
    [booking.customer_id],
    variables,
    channels
  );
}

// ============================================================================
// ADD-ONS & EXTRAS
// ============================================================================

/**
 * Notify add-on service added
 */
export async function notifyAddonAdded(
  bookingId: string,
  addonName: string,
  addonPrice: number,
  newTotal: number,
  channels?: NotificationChannel[]
) {
  const booking = await getBookingDetails(bookingId);
  if (!booking) return { success: false, error: "Booking not found" };

  const variables = {
    addon_name: addonName,
    addon_price: `ZAR ${addonPrice}`,
    new_total: `ZAR ${newTotal}`,
    booking_date: new Date(booking.scheduled_at).toLocaleDateString(),
    provider_name: booking.provider?.business_name || "Provider",
    booking_id: bookingId,
  };

  return await sendTemplateNotification(
    "addon_added",
    [booking.customer_id],
    variables,
    channels
  );
}

/**
 * Notify add-on service removed
 */
export async function notifyAddonRemoved(
  bookingId: string,
  addonName: string,
  refundAmount: number,
  newTotal: number,
  channels?: NotificationChannel[]
) {
  const booking = await getBookingDetails(bookingId);
  if (!booking) return { success: false, error: "Booking not found" };

  const variables = {
    addon_name: addonName,
    refund_amount: `ZAR ${refundAmount}`,
    new_total: `ZAR ${newTotal}`,
    booking_id: bookingId,
  };

  return await sendTemplateNotification(
    "addon_removed",
    [booking.customer_id],
    variables,
    channels
  );
}

/**
 * Notify service upgrade offered
 */
export async function notifyServiceUpgradeOffered(
  bookingId: string,
  upgradeName: string,
  upgradePrice: number,
  upgradeBenefits: string,
  channels?: NotificationChannel[]
) {
  const booking = await getBookingDetails(bookingId);
  if (!booking) return { success: false, error: "Booking not found" };

  const variables = {
    provider_name: booking.provider?.business_name || "Provider",
    upgrade_name: upgradeName,
    upgrade_price: `ZAR ${upgradePrice}`,
    upgrade_benefits: upgradeBenefits,
    booking_id: bookingId,
  };

  return await sendTemplateNotification(
    "service_upgrade_offered",
    [booking.customer_id],
    variables,
    channels
  );
}

// ============================================================================
// TRAVEL FEES
// ============================================================================

/**
 * Notify travel fee applied
 */
export async function notifyTravelFeeApplied(
  bookingId: string,
  travelFee: number,
  distance: number,
  totalAmount: number,
  channels?: NotificationChannel[]
) {
  const booking = await getBookingDetails(bookingId);
  if (!booking) return { success: false, error: "Booking not found" };

  const variables = {
    travel_fee: `ZAR ${travelFee}`,
    distance: distance.toString(),
    total_amount: `ZAR ${totalAmount}`,
    booking_id: bookingId,
  };

  return await sendTemplateNotification(
    "travel_fee_applied",
    [booking.customer_id],
    variables,
    channels
  );
}

// ============================================================================
// TIME & DATE CHANGES
// ============================================================================

/**
 * Notify booking time changed
 */
export async function notifyBookingTimeChanged(
  bookingId: string,
  oldTime: Date,
  newTime: Date,
  channels?: NotificationChannel[]
) {
  const booking = await getBookingDetails(bookingId);
  if (!booking) return { success: false, error: "Booking not found" };

  const variables = {
    provider_name: booking.provider?.business_name || "Provider",
    booking_date: new Date(booking.scheduled_at).toLocaleDateString(),
    old_time: oldTime.toLocaleTimeString(),
    new_time: newTime.toLocaleTimeString(),
    booking_id: bookingId,
  };

  // Notify customer
  await sendTemplateNotification("booking_time_changed", [booking.customer_id], variables, channels);

  // Notify provider
  if (booking.provider?.user_id) {
    await sendTemplateNotification(
      "provider_booking_time_changed",
      [booking.provider.user_id],
      {
        customer_name: booking.customer?.full_name || "Customer",
        ...variables,
      },
      channels
    );
  }

  return { success: true };
}

/**
 * Notify booking date changed
 */
export async function notifyBookingDateChanged(
  bookingId: string,
  oldDate: Date,
  newDate: Date,
  bookingTime: Date,
  channels?: NotificationChannel[]
) {
  const booking = await getBookingDetails(bookingId);
  if (!booking) return { success: false, error: "Booking not found" };

  const variables = {
    provider_name: booking.provider?.business_name || "Provider",
    old_date: oldDate.toLocaleDateString(),
    new_date: newDate.toLocaleDateString(),
    booking_time: bookingTime.toLocaleTimeString(),
    booking_id: bookingId,
  };

  // Notify customer
  await sendTemplateNotification("booking_date_changed", [booking.customer_id], variables, channels);

  // Notify provider
  if (booking.provider?.user_id) {
    await sendTemplateNotification(
      "provider_booking_date_changed",
      [booking.provider.user_id],
      {
        customer_name: booking.customer?.full_name || "Customer",
        ...variables,
      },
      channels
    );
  }

  return { success: true };
}

// ============================================================================
// ACCOUNT & SECURITY
// ============================================================================

/**
 * Send password reset notification
 */
export async function notifyPasswordReset(userId: string, resetToken: string, channels: NotificationChannel[] = ["email"]) {
  const variables = {
    reset_token: resetToken,
  };

  return await sendTemplateNotification(
    "password_reset",
    [userId],
    variables,
    channels
  );
}

/**
 * Send email verification notification
 */
export async function notifyEmailVerification(userId: string, verificationToken: string, channels: NotificationChannel[] = ["email"]) {
  const variables = {
    verification_token: verificationToken,
  };

  return await sendTemplateNotification(
    "email_verification",
    [userId],
    variables,
    channels
  );
}

/**
 * Notify account suspended
 */
export async function notifyAccountSuspended(userId: string, suspensionReason: string, channels?: NotificationChannel[]) {
  const variables = {
    suspension_reason: suspensionReason,
  };

  return await sendTemplateNotification(
    "account_suspended",
    [userId],
    variables,
    channels
  );
}

// ============================================================================
// WELCOME & PROMOTIONAL
// ============================================================================

/**
 * Send welcome message to new user
 */
export async function notifyWelcomeMessage(userId: string, channels?: NotificationChannel[]) {
  return await sendTemplateNotification(
    "welcome_message",
    [userId],
    {},
    channels
  );
}

/**
 * Notify promotion available
 */
export async function notifyPromotionAvailable(
  userIds: string[],
  promotionTitle: string,
  promotionDescription: string,
  promoCode: string,
  discountAmount: number,
  expiryDate: Date,
  promotionId: string,
  channels?: NotificationChannel[]
) {
  const variables = {
    promotion_title: promotionTitle,
    promotion_description: promotionDescription,
    promo_code: promoCode,
    discount_amount: `ZAR ${discountAmount}`,
    expiry_date: expiryDate.toLocaleDateString(),
    promotion_id: promotionId,
  };

  return await sendTemplateNotification(
    "promotion_available",
    userIds,
    variables,
    channels
  );
}

// ============================================================================
// LOYALTY & REWARDS
// ============================================================================

/**
 * Notify loyalty points earned
 */
export async function notifyLoyaltyPointsEarned(
  userId: string,
  points: number,
  totalPoints: number,
  providerName: string,
  bookingDate: Date,
  channels?: NotificationChannel[]
) {
  const variables = {
    points: points.toString(),
    total_points: totalPoints.toString(),
    provider_name: providerName,
    booking_date: bookingDate.toLocaleDateString(),
  };

  return await sendTemplateNotification(
    "loyalty_points_earned",
    [userId],
    variables,
    channels
  );
}

/**
 * Notify loyalty points redeemed
 */
export async function notifyLoyaltyPointsRedeemed(
  userId: string,
  points: number,
  discountAmount: number,
  remainingPoints: number,
  channels?: NotificationChannel[]
) {
  const variables = {
    points: points.toString(),
    discount_amount: `ZAR ${discountAmount}`,
    remaining_points: remainingPoints.toString(),
  };

  return await sendTemplateNotification(
    "loyalty_points_redeemed",
    [userId],
    variables,
    channels
  );
}

/**
 * Notify loyalty tier upgraded
 */
export async function notifyLoyaltyTierUpgraded(
  userId: string,
  newTier: string,
  oldTier: string,
  tierBenefits: string,
  channels?: NotificationChannel[]
) {
  const variables = {
    new_tier: newTier,
    old_tier: oldTier,
    tier_benefits: tierBenefits,
  };

  return await sendTemplateNotification(
    "loyalty_tier_upgraded",
    [userId],
    variables,
    channels
  );
}

/**
 * Notify referral bonus earned
 */
export async function notifyReferralBonusEarned(
  userId: string,
  bonusAmount: number,
  referredName: string,
  referralCode: string,
  channels?: NotificationChannel[]
) {
  const variables = {
    bonus_amount: `ZAR ${bonusAmount}`,
    referred_name: referredName,
    referral_code: referralCode,
  };

  return await sendTemplateNotification(
    "referral_bonus_earned",
    [userId],
    variables,
    channels
  );
}

/**
 * Notify referral code used
 */
export async function notifyReferralCodeUsed(
  userId: string,
  referrerName: string,
  bonusAmount: number,
  channels?: NotificationChannel[]
) {
  const variables = {
    referrer_name: referrerName,
    bonus_amount: `ZAR ${bonusAmount}`,
  };

  return await sendTemplateNotification(
    "referral_code_used",
    [userId],
    variables,
    channels
  );
}

// ============================================================================
// SERVICE PACKAGES
// ============================================================================

/**
 * Notify service package purchased
 */
export async function notifyServicePackagePurchased(
  userId: string,
  packageName: string,
  servicesIncluded: string,
  packageValue: number,
  expiryDate: Date,
  packageId: string,
  channels?: NotificationChannel[]
) {
  const variables = {
    package_name: packageName,
    services_included: servicesIncluded,
    package_value: `ZAR ${packageValue}`,
    expiry_date: expiryDate.toLocaleDateString(),
    package_id: packageId,
  };

  return await sendTemplateNotification(
    "service_package_purchased",
    [userId],
    variables,
    channels
  );
}

/**
 * Notify service package expiring soon
 */
export async function notifyServicePackageExpiring(
  userId: string,
  packageName: string,
  expiryDate: Date,
  remainingServices: number,
  packageId: string,
  channels?: NotificationChannel[]
) {
  const variables = {
    package_name: packageName,
    expiry_date: expiryDate.toLocaleDateString(),
    remaining_services: remainingServices.toString(),
    package_id: packageId,
  };

  return await sendTemplateNotification(
    "service_package_expiring",
    [userId],
    variables,
    channels
  );
}

/**
 * Notify service package expired
 */
export async function notifyServicePackageExpired(
  userId: string,
  packageName: string,
  expiryDate: Date,
  unusedServices: number,
  channels?: NotificationChannel[]
) {
  const variables = {
    package_name: packageName,
    expiry_date: expiryDate.toLocaleDateString(),
    unused_services: unusedServices.toString(),
  };

  return await sendTemplateNotification(
    "service_package_expired",
    [userId],
    variables,
    channels
  );
}

/**
 * Notify service package used
 */
export async function notifyServicePackageUsed(
  userId: string,
  packageName: string,
  remainingServices: number,
  packageId: string,
  channels?: NotificationChannel[]
) {
  const variables = {
    package_name: packageName,
    remaining_services: remainingServices.toString(),
    package_id: packageId,
  };

  return await sendTemplateNotification(
    "service_package_used",
    [userId],
    variables,
    channels
  );
}

// ============================================================================
// PRODUCT ORDER NOTIFICATIONS
// ============================================================================

/**
 * Send order confirmation to customer (product order)
 * Uses notification template "order_confirmation". Create it in Admin → Notification templates
 * with key "order_confirmation" and variables: order_number, order_id, total_amount
 */
export async function notifyOrderConfirmation(
  userId: string,
  orderId: string,
  orderNumber: string,
  totalAmount: number,
  channels: NotificationChannel[] = ["push", "email"]
) {
  const variables = {
    order_number: orderNumber,
    order_id: orderId,
    total_amount: `R${totalAmount.toFixed(2)}`,
  };

  return await sendTemplateNotification(
    "order_confirmation",
    [userId],
    variables,
    channels
  );
}

// ============================================================================
// GIFT CARDS
// ============================================================================

/**
 * Notify gift card purchased
 */
export async function notifyGiftCardPurchased(
  userId: string,
  giftCardAmount: number,
  recipientName: string,
  giftCardCode: string,
  channels?: NotificationChannel[]
) {
  const variables = {
    gift_card_amount: `ZAR ${giftCardAmount}`,
    recipient_name: recipientName,
    gift_card_code: giftCardCode,
  };

  return await sendTemplateNotification(
    "gift_card_purchased",
    [userId],
    variables,
    channels
  );
}

/**
 * Notify gift card received
 */
export async function notifyGiftCardReceived(
  userId: string,
  senderName: string,
  giftCardAmount: number,
  giftCardCode: string,
  message: string,
  channels?: NotificationChannel[]
) {
  const variables = {
    sender_name: senderName,
    gift_card_amount: `ZAR ${giftCardAmount}`,
    gift_card_code: giftCardCode,
    message: message,
  };

  return await sendTemplateNotification(
    "gift_card_received",
    [userId],
    variables,
    channels
  );
}

// ============================================================================
// MEMBERSHIPS & SUBSCRIPTIONS
// ============================================================================

/**
 * Notify membership renewal reminder
 */
export async function notifyMembershipRenewalReminder(
  userId: string,
  membershipName: string,
  renewalDate: Date,
  renewalAmount: number,
  channels?: NotificationChannel[]
) {
  const variables = {
    membership_name: membershipName,
    renewal_date: renewalDate.toLocaleDateString(),
    renewal_amount: `ZAR ${renewalAmount}`,
  };

  return await sendTemplateNotification(
    "membership_renewal_reminder",
    [userId],
    variables,
    channels
  );
}

/**
 * Notify membership activated
 */
export async function notifyMembershipActivated(
  userId: string,
  membershipName: string,
  benefits: string,
  channels?: NotificationChannel[]
) {
  const variables = {
    membership_name: membershipName,
    benefits: benefits,
  };

  return await sendTemplateNotification(
    "membership_activated",
    [userId],
    variables,
    channels
  );
}

// ============================================================================
// SUPPORT & MESSAGES
// ============================================================================

/**
 * Notify new message
 */
export async function notifyNewMessage(
  userId: string,
  senderName: string,
  messagePreview: string,
  conversationId: string,
  channels?: NotificationChannel[]
) {
  const variables = {
    sender_name: senderName,
    message_preview: messagePreview,
    conversation_id: conversationId,
  };

  return await sendTemplateNotification(
    "new_message",
    [userId],
    variables,
    channels
  );
}

/**
 * Notify support ticket created
 */
export async function notifySupportTicketCreated(
  userId: string,
  ticketNumber: string,
  ticketSubject: string,
  ticketId: string,
  channels?: NotificationChannel[]
) {
  const variables = {
    ticket_number: ticketNumber,
    ticket_subject: ticketSubject,
    ticket_id: ticketId,
  };

  return await sendTemplateNotification(
    "support_ticket_created",
    [userId],
    variables,
    channels
  );
}

/**
 * Notify support ticket updated
 */
export async function notifySupportTicketUpdated(
  userId: string,
  ticketNumber: string,
  updateMessage: string,
  ticketId: string,
  channels?: NotificationChannel[]
) {
  const variables = {
    ticket_number: ticketNumber,
    update_message: updateMessage,
    ticket_id: ticketId,
  };

  return await sendTemplateNotification(
    "support_ticket_updated",
    [userId],
    variables,
    channels
  );
}

// ============================================================================
// DISPUTES & COMPLAINTS
// ============================================================================

/**
 * Notify dispute opened
 */
export async function notifyDisputeOpened(
  bookingId: string,
  disputeReason: string,
  disputeId: string,
  channels?: NotificationChannel[]
) {
  const booking = await getBookingDetails(bookingId);
  if (!booking) return { success: false, error: "Booking not found" };

  const variables = {
    booking_number: booking.booking_number || bookingId,
    provider_name: booking.provider?.business_name || "Provider",
    dispute_reason: disputeReason,
    dispute_id: disputeId,
  };

  // Notify customer
  await sendTemplateNotification("dispute_opened", [booking.customer_id], variables, channels);

  // Notify provider
  if (booking.provider?.user_id) {
    await sendTemplateNotification(
      "provider_dispute_opened",
      [booking.provider.user_id],
      {
        customer_name: booking.customer?.full_name || "Customer",
        ...variables,
      },
      channels
    );
  }

  return { success: true };
}

/**
 * Notify dispute resolved
 */
export async function notifyDisputeResolved(
  bookingId: string,
  resolutionDetails: string,
  disputeOutcome: string,
  disputeId: string,
  channels?: NotificationChannel[]
) {
  const booking = await getBookingDetails(bookingId);
  if (!booking) return { success: false, error: "Booking not found" };

  const variables = {
    booking_number: booking.booking_number || bookingId,
    resolution_details: resolutionDetails,
    dispute_outcome: disputeOutcome,
    dispute_id: disputeId,
  };

  // Notify customer
  await sendTemplateNotification("dispute_resolved", [booking.customer_id], variables, channels);

  // Notify provider
  if (booking.provider?.user_id) {
    await sendTemplateNotification(
      "provider_dispute_resolved",
      [booking.provider.user_id],
      {
        customer_name: booking.customer?.full_name || "Customer",
        ...variables,
      },
      channels
    );
  }

  return { success: true };
}

/**
 * Notify complaint filed
 */
export async function notifyComplaintFiled(
  bookingId: string,
  complaintDescription: string,
  complaintId: string,
  channels?: NotificationChannel[]
) {
  const booking = await getBookingDetails(bookingId);
  if (!booking) return { success: false, error: "Booking not found" };

  const variables = {
    booking_number: booking.booking_number || bookingId,
    provider_name: booking.provider?.business_name || "Provider",
    complaint_description: complaintDescription,
    complaint_id: complaintId,
  };

  return await sendTemplateNotification(
    "complaint_filed",
    [booking.customer_id],
    variables,
    channels
  );
}

/**
 * Notify quality issue reported
 */
export async function notifyQualityIssueReported(
  bookingId: string,
  issueDescription: string,
  channels?: NotificationChannel[]
) {
  const booking = await getBookingDetails(bookingId);
  if (!booking) return { success: false, error: "Booking not found" };

  const variables = {
    provider_name: booking.provider?.business_name || "Provider",
    booking_date: new Date(booking.scheduled_at).toLocaleDateString(),
    issue_description: issueDescription,
    booking_id: bookingId,
  };

  return await sendTemplateNotification(
    "quality_issue_reported",
    [booking.customer_id],
    variables,
    channels
  );
}

// ============================================================================
// SAFETY & SECURITY
// ============================================================================

/**
 * Send safety check-in (at-home service)
 */
export async function notifySafetyCheckIn(bookingId: string, channels?: NotificationChannel[]) {
  const booking = await getBookingDetails(bookingId);
  if (!booking || booking.location_type !== "at_home") {
    return { success: false, error: "Booking not found or not at-home service" };
  }

  const variables = {
    provider_name: booking.provider?.business_name || "Provider",
    booking_id: bookingId,
  };

  return await sendTemplateNotification(
    "safety_check_in",
    [booking.customer_id],
    variables,
    channels
  );
}

/**
 * Send safety alert if check-in not confirmed
 */
export async function notifySafetyAlert(bookingId: string, channels?: NotificationChannel[]) {
  const booking = await getBookingDetails(bookingId);
  if (!booking || booking.location_type !== "at_home") {
    return { success: false, error: "Booking not found or not at-home service" };
  }

  return await sendTemplateNotification(
    "safety_alert",
    [booking.customer_id],
    {},
    channels
  );
}

// ============================================================================
// SPECIAL REQUESTS & INSTRUCTIONS
// ============================================================================

/**
 * Notify special instructions added
 */
export async function notifySpecialInstructionsAdded(
  bookingId: string,
  instructions: string,
  channels?: NotificationChannel[]
) {
  const booking = await getBookingDetails(bookingId);
  if (!booking) return { success: false, error: "Booking not found" };

  const variables = {
    provider_name: booking.provider?.business_name || "Provider",
    booking_date: new Date(booking.scheduled_at).toLocaleDateString(),
    instructions: instructions,
    booking_id: bookingId,
  };

  // Notify customer
  await sendTemplateNotification("special_instructions_added", [booking.customer_id], variables, channels);

  // Notify provider
  if (booking.provider?.user_id) {
    await sendTemplateNotification(
      "provider_special_instructions",
      [booking.provider.user_id],
      {
        customer_name: booking.customer?.full_name || "Customer",
        ...variables,
      },
      channels
    );
  }

  return { success: true };
}

/**
 * Notify provider of customer allergies
 */
export async function notifyAllergyAlert(
  bookingId: string,
  allergies: string,
  channels?: NotificationChannel[]
) {
  const booking = await getBookingDetails(bookingId);
  if (!booking || !booking.provider?.user_id) {
    return { success: false, error: "Booking or provider not found" };
  }

  const variables = {
    customer_name: booking.customer?.full_name || "Customer",
    allergies: allergies,
    booking_date: new Date(booking.scheduled_at).toLocaleDateString(),
    booking_time: new Date(booking.scheduled_at).toLocaleTimeString(),
    services: booking.services?.map((s: any) => s.service?.name).join(", ") || "Services",
    booking_id: bookingId,
  };

  return await sendTemplateNotification(
    "allergy_alert_provider",
    [booking.provider.user_id],
    variables,
    channels
  );
}

// ============================================================================
// WEATHER & EXTERNAL FACTORS
// ============================================================================

/**
 * Notify weather alert
 */
export async function notifyWeatherAlert(
  bookingId: string,
  weatherCondition: string,
  channels?: NotificationChannel[]
) {
  const booking = await getBookingDetails(bookingId);
  if (!booking) return { success: false, error: "Booking not found" };

  const variables = {
    provider_name: booking.provider?.business_name || "Provider",
    booking_date: new Date(booking.scheduled_at).toLocaleDateString(),
    booking_time: new Date(booking.scheduled_at).toLocaleTimeString(),
    weather_condition: weatherCondition,
    booking_id: bookingId,
  };

  // Notify customer
  await sendTemplateNotification("weather_alert", [booking.customer_id], variables, channels);

  // Notify provider
  if (booking.provider?.user_id) {
    await sendTemplateNotification(
      "provider_weather_alert",
      [booking.provider.user_id],
      {
        customer_name: booking.customer?.full_name || "Customer",
        ...variables,
      },
      channels
    );
  }

  return { success: true };
}

// ============================================================================
// PROVIDER ONBOARDING
// ============================================================================

/**
 * Notify provider onboarding welcome
 */
export async function notifyProviderOnboardingWelcome(providerUserId: string, channels?: NotificationChannel[]) {
  return await sendTemplateNotification(
    "provider_onboarding_welcome",
    [providerUserId],
    {},
    channels
  );
}

/**
 * Notify provider profile approved
 */
export async function notifyProviderProfileApproved(providerUserId: string, channels?: NotificationChannel[]) {
  return await sendTemplateNotification(
    "provider_profile_approved",
    [providerUserId],
    {},
    channels
  );
}

/**
 * Notify provider profile rejected
 */
export async function notifyProviderProfileRejected(
  providerUserId: string,
  rejectionReason: string,
  channels?: NotificationChannel[]
) {
  const variables = {
    rejection_reason: rejectionReason,
  };

  return await sendTemplateNotification(
    "provider_profile_rejected",
    [providerUserId],
    variables,
    channels
  );
}

// ============================================================================
// CUSTOMER EXPERIENCE ENHANCEMENTS
// ============================================================================

/**
 * Notify waitlist slot available
 */
export async function notifyBookingWaitlistAvailable(
  userId: string,
  providerName: string,
  availableDate: Date,
  availableTime: Date,
  services: string,
  providerId: string,
  channels?: NotificationChannel[]
) {
  const variables = {
    provider_name: providerName,
    available_date: availableDate.toLocaleDateString(),
    available_time: availableTime.toLocaleTimeString(),
    services: services,
    provider_id: providerId,
  };

  return await sendTemplateNotification(
    "booking_waitlist_available",
    [userId],
    variables,
    channels
  );
}

/**
 * Notify provider recommendation
 */
export async function notifyProviderRecommendation(
  userId: string,
  providerName: string,
  specialties: string,
  rating: number,
  recommendationReason: string,
  providerId: string,
  channels?: NotificationChannel[]
) {
  const variables = {
    provider_name: providerName,
    specialties: specialties,
    rating: rating.toString(),
    recommendation_reason: recommendationReason,
    provider_id: providerId,
  };

  return await sendTemplateNotification(
    "provider_recommendation",
    [userId],
    variables,
    channels
  );
}

/**
 * Notify service suggestion
 */
export async function notifyServiceSuggestion(
  userId: string,
  suggestedService: string,
  providerName: string,
  servicePrice: number,
  serviceDescription: string,
  serviceId: string,
  channels?: NotificationChannel[]
) {
  const variables = {
    suggested_service: suggestedService,
    provider_name: providerName,
    service_price: `ZAR ${servicePrice}`,
    service_description: serviceDescription,
    service_id: serviceId,
  };

  return await sendTemplateNotification(
    "service_suggestion",
    [userId],
    variables,
    channels
  );
}

// ============================================================================
// EMERGENCY CANCELLATIONS
// ============================================================================

/**
 * Notify emergency cancellation
 */
export async function notifyEmergencyCancellation(
  bookingId: string,
  emergencyReason: string,
  refundInfo: string,
  channels?: NotificationChannel[]
) {
  const booking = await getBookingDetails(bookingId);
  if (!booking) return { success: false, error: "Booking not found" };

  const variables = {
    provider_name: booking.provider?.business_name || "Provider",
    booking_date: new Date(booking.scheduled_at).toLocaleDateString(),
    emergency_reason: emergencyReason,
    refund_info: refundInfo,
    booking_id: bookingId,
  };

  return await sendTemplateNotification(
    "booking_cancelled_emergency",
    [booking.customer_id],
    variables,
    channels
  );
}
