/**
 * Waitlist Matching Logic
 * Matches waitlist entries with available booking slots
 */

import { getSupabaseAdmin } from "@/lib/supabase/admin";

export interface WaitlistMatch {
  entry: {
    id: string;
    provider_id?: string;
    service_id?: string;
    staff_id?: string | null;
    customer_id?: string;
    customer_email?: string;
    customer_name?: string;
    customer_phone?: string;
    [key: string]: unknown;
  };
  availableSlots: Array<{ date: string; time: string }>;
  matchReason?: string;
}
import { sendTemplateNotification } from "@/lib/notifications/onesignal";

/**
 * Match waitlist entries when a booking is cancelled
 */
export async function matchWaitlistOnCancellation(supabase: any, cancelledBookingId: string) {
  const supabaseAdmin = getSupabaseAdmin();

  try {
    // Get cancelled booking details
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select(`
        id,
        provider_id,
        scheduled_at,
        booking_services(
          id,
          offering_id,
          staff_id,
          scheduled_start_at,
          scheduled_end_at
        )
      `)
      .eq("id", cancelledBookingId)
      .single();

    if (bookingError || !booking) {
      return;
    }

    const bookingServices = booking.booking_services as any[];
    if (bookingServices.length === 0) {
      return;
    }

    const firstService = bookingServices[0];
    const staffId = firstService.staff_id;
    const serviceId = firstService.offering_id;
    const scheduledDate = new Date(booking.scheduled_at);
    const dateStr = scheduledDate.toISOString().split("T")[0];
    const timeStr = scheduledDate.toTimeString().substring(0, 5);

    // Find matching waitlist entries
    const { data: waitlistEntries, error: waitlistError } = await supabaseAdmin
      .from("waitlist_entries")
      .select(`
        *,
        customer:users(
          id,
          email,
          full_name
        )
      `)
      .eq("provider_id", booking.provider_id)
      .eq("status", "waiting")
      .or(`staff_id.is.null,staff_id.eq.${staffId}`)
      .or(`service_id.is.null,service_id.eq.${serviceId}`)
      .or(`preferred_date.is.null,preferred_date.eq.${dateStr}`)
      .order("priority", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(10); // Notify top 10 matches

    if (waitlistError || !waitlistEntries || waitlistEntries.length === 0) {
      return;
    }

    // Notify matching waitlist entries
    for (const entry of waitlistEntries) {
      const customer = entry.customer as any;
      if (!customer?.id) continue;

      try {
        // Create notification
        await supabaseAdmin.from("notifications").insert({
          user_id: customer.id,
          type: "waitlist_available",
          title: "Booking Slot Available!",
          message: `A booking slot has become available! Date: ${dateStr}, Time: ${timeStr}`,
          metadata: {
            waitlist_id: entry.id,
            booking_id: cancelledBookingId,
            available_date: dateStr,
            available_time: timeStr,
          },
          link: `/booking?provider=${booking.provider_id}&date=${dateStr}&time=${timeStr}`,
        });

        // Send push/email notification
        await sendTemplateNotification(
          "booking_waitlist_available",
          [customer.id],
          {
            provider_name: "Provider", // Could fetch provider name
            available_date: dateStr,
            available_time: timeStr,
            services: serviceId ? "Service" : "Services",
            provider_id: booking.provider_id,
          },
          ["push", "email"]
        );
      } catch (notifError) {
        console.error(`Error notifying waitlist entry ${entry.id}:`, notifError);
      }
    }
  } catch (error) {
    console.error("Error matching waitlist on cancellation:", error);
  }
}

/**
 * Find waitlist entries for a provider (for provider UI to see matches)
 */
export async function findWaitlistMatches(
  supabase: any,
  providerId: string,
  options?: { date?: string; staffId?: string | null; maxMatches?: number }
): Promise<any[]> {
  let query = supabase
    .from("waitlist_entries")
    .select(`
      *,
      customer:users(id, email, full_name)
    `)
    .eq("provider_id", providerId)
    .eq("status", "waiting")
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(options?.maxMatches ?? 10);

  if (options?.date) {
    query = query.or(`preferred_date.is.null,preferred_date.eq.${options.date}`);
  }
  if (options?.staffId) {
    query = query.or(`staff_id.is.null,staff_id.eq.${options.staffId}`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

/**
 * Check and match waitlist entries for a specific date/staff/service
 */
export async function checkWaitlistForAvailability(
  providerId: string,
  staffId: string | null,
  serviceId: string | null,
  date: string,
  time: string
) {
  const supabaseAdmin = getSupabaseAdmin();

  try {
    // Find matching waitlist entries
    const { data: waitlistEntries } = await supabaseAdmin
      .from("waitlist_entries")
      .select(`
        *,
        customer:users(
          id,
          email,
          full_name
        )
      `)
      .eq("provider_id", providerId)
      .eq("status", "waiting")
      .or(`preferred_date.is.null,preferred_date.eq.${date}`)
      .or(`staff_id.is.null,staff_id.eq.${staffId || "null"}`)
      .or(`service_id.is.null,service_id.eq.${serviceId || "null"}`)
      .order("priority", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(10);

    if (!waitlistEntries || waitlistEntries.length === 0) {
      return { matched: 0 };
    }

    // Notify entries
    let notified = 0;
    for (const entry of waitlistEntries) {
      const customer = entry.customer as any;
      if (!customer?.id) continue;

      try {
        await supabaseAdmin.from("notifications").insert({
          user_id: customer.id,
          type: "waitlist_available",
          title: "Booking Slot Available!",
          message: `A booking slot has become available! Date: ${date}, Time: ${time}`,
          metadata: {
            waitlist_id: entry.id,
            available_date: date,
            available_time: time,
          },
          link: `/booking?provider=${providerId}&date=${date}&time=${time}`,
        });

        await sendTemplateNotification(
          "booking_waitlist_available",
          [customer.id],
          {
            provider_name: "Provider",
            available_date: date,
            available_time: time,
            services: serviceId ? "Service" : "Services",
            provider_id: providerId,
          },
          ["push", "email"]
        );

        notified++;
      } catch (notifError) {
        console.error(`Error notifying waitlist entry ${entry.id}:`, notifError);
      }
    }

    return { matched: notified };
  } catch (error) {
    console.error("Error checking waitlist for availability:", error);
    throw error;
  }
}
