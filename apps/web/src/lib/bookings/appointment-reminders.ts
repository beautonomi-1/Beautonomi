/**
 * Appointment Reminders
 * Automated reminder system for upcoming bookings
 */

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { sendTemplateNotification } from "@/lib/notifications/onesignal";

export interface ReminderConfig {
  hoursBefore: number[]; // e.g., [24, 2] for 24 hours and 2 hours before
  channels: ("push" | "email" | "sms")[];
}

const DEFAULT_REMINDER_CONFIG: ReminderConfig = {
  hoursBefore: [24, 2], // 24 hours and 2 hours before
  channels: ["push", "email"],
};

/**
 * Send appointment reminders for upcoming bookings
 */
export async function sendAppointmentReminders(config: ReminderConfig = DEFAULT_REMINDER_CONFIG) {
  const supabaseAdmin = getSupabaseAdmin();

  try {
    const now = new Date();
    const remindersSent: string[] = [];

    // Process each reminder time
    for (const hoursBefore of config.hoursBefore) {
      const reminderTime = new Date(now.getTime() + hoursBefore * 60 * 60 * 1000);
      const reminderTimeStart = new Date(reminderTime.getTime() - 30 * 60 * 1000); // 30 min window
      const reminderTimeEnd = new Date(reminderTime.getTime() + 30 * 60 * 1000);

      // Find bookings that need reminders
      const { data: bookings, error } = await supabaseAdmin
        .from("bookings")
        .select(`
          id,
          booking_number,
          scheduled_at,
          customer_id,
          provider_id,
          location_type,
          customers:users!bookings_customer_id_fkey(
            id,
            full_name,
            email,
            phone
          ),
          providers!inner(
            id,
            business_name
          ),
          booking_services(
            id,
            offering:offerings!inner(
              title
            )
          )
        `)
        .eq("status", "confirmed")
        .gte("scheduled_at", reminderTimeStart.toISOString())
        .lte("scheduled_at", reminderTimeEnd.toISOString())
        .is("cancelled_at", null);

      if (error) {
        console.error(`Error fetching bookings for ${hoursBefore}h reminder:`, error);
        continue;
      }

      if (!bookings || bookings.length === 0) {
        continue;
      }

      // Check which bookings haven't received this reminder yet
      for (const booking of bookings) {
        const reminderKey = `reminder_${hoursBefore}h_${booking.id}`;

        // Check if reminder already sent
        const { data: existingNotification } = await supabaseAdmin
          .from("notifications")
          .select("id")
          .eq("user_id", booking.customer_id)
          .eq("type", "appointment_reminder")
          .contains("metadata", { reminder_key: reminderKey })
          .limit(1);

        if (existingNotification && existingNotification.length > 0) {
          continue; // Already sent
        }

        const _customer = booking.customers as any;
        const provider = booking.providers as any;
        const services = (booking.booking_services || []).map((bs: any) => bs.offering?.title || "Service").join(", ");

        const scheduledDate = new Date(booking.scheduled_at);
        const dateStr = scheduledDate.toLocaleDateString("en-US", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        });
        const timeStr = scheduledDate.toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        });

        // Create notification record
        await supabaseAdmin.from("notifications").insert({
          user_id: booking.customer_id,
          type: "appointment_reminder",
          title: `Appointment Reminder - ${hoursBefore} hour${hoursBefore > 1 ? "s" : ""} to go`,
          message: `Your appointment with ${provider.business_name} is in ${hoursBefore} hour${hoursBefore > 1 ? "s" : ""}. Date: ${dateStr} at ${timeStr}`,
          metadata: {
            booking_id: booking.id,
            reminder_key: reminderKey,
            hours_before: hoursBefore,
          },
          link: `/account-settings/bookings/${booking.id}`,
        });

        // Send push/email/SMS notification
        try {
          await sendTemplateNotification(
            "appointment_reminder",
            [booking.customer_id],
            {
              provider_name: provider.business_name,
              appointment_date: dateStr,
              appointment_time: timeStr,
              services: services,
              hours_before: hoursBefore.toString(),
              booking_number: booking.booking_number || "",
              booking_id: booking.id,
            },
            config.channels
          );

          remindersSent.push(booking.id);
        } catch (notifError) {
          console.error(`Error sending reminder for booking ${booking.id}:`, notifError);
        }
      }
    }

    return {
      success: true,
      remindersSent: remindersSent.length,
      totalBookings: remindersSent.length,
    };
  } catch (error) {
    console.error("Error sending appointment reminders:", error);
    throw error;
  }
}

/**
 * Send reminder for a specific booking (manual trigger)
 */
export async function sendBookingReminder(bookingId: string, hoursBefore: number) {
  const supabaseAdmin = getSupabaseAdmin();

  try {
    const { data: booking, error } = await supabaseAdmin
      .from("bookings")
      .select(`
        id,
        booking_number,
        scheduled_at,
        customer_id,
        provider_id,
        location_type,
        customers:users!bookings_customer_id_fkey(
          id,
          full_name,
          email,
          phone
        ),
        providers!inner(
          id,
          business_name
        ),
        booking_services(
          id,
          offering:offerings!inner(
            title
          )
        )
      `)
      .eq("id", bookingId)
      .eq("status", "confirmed")
      .single();

    if (error || !booking) {
      throw new Error("Booking not found or not confirmed");
    }

    const _customer = booking.customers as any;
    const provider = booking.providers as any;
    const services = (booking.booking_services || []).map((bs: any) => bs.offering?.title || "Service").join(", ");

    const scheduledDate = new Date(booking.scheduled_at);
    const dateStr = scheduledDate.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const timeStr = scheduledDate.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });

    // Create notification
    await supabaseAdmin.from("notifications").insert({
      user_id: booking.customer_id,
      type: "appointment_reminder",
      title: `Appointment Reminder`,
      message: `Your appointment with ${provider.business_name} is coming up. Date: ${dateStr} at ${timeStr}`,
      metadata: {
        booking_id: booking.id,
        hours_before: hoursBefore,
      },
      link: `/account-settings/bookings/${booking.id}`,
    });

    // Send notification
    await sendTemplateNotification(
      "appointment_reminder",
      [booking.customer_id],
      {
        provider_name: provider.business_name,
        appointment_date: dateStr,
        appointment_time: timeStr,
        services: services,
        hours_before: hoursBefore.toString(),
        booking_number: booking.booking_number || "",
        booking_id: booking.id,
      },
      ["push", "email"]
    );

    return { success: true };
  } catch (error) {
    console.error("Error sending booking reminder:", error);
    throw error;
  }
}
