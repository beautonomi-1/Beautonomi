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
        const { insertNotification } = await import("@/lib/notifications/insert-notification");
        await insertNotification({
          user_id: booking.customer_id,
          type: "appointment_reminder",
          title: `Appointment Reminder - ${hoursBefore} hour${hoursBefore > 1 ? "s" : ""} to go`,
          message: `Your appointment with ${provider.business_name} is in ${hoursBefore} hour${hoursBefore > 1 ? "s" : ""}. Date: ${dateStr} at ${timeStr}`,
          data: {
            booking_id: booking.id,
            reminder_key: reminderKey,
            hours_before: hoursBefore,
          },
          action_url: `/account-settings/bookings/${booking.id}`,
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
            config.channels,
            { appType: "customer" }
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

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

/**
 * Send "time to rebook" nudges for completed bookings where the offering has
 * reminder_to_rebook_enabled and today matches completed_at + reminder_to_rebook_weeks.
 * Intended to run once daily via /api/cron/send-reminders (same cron as appointment reminders).
 */
export async function sendRebookReminders() {
  const supabaseAdmin = getSupabaseAdmin();
  const now = new Date();
  const startOfTodayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const sent: string[] = [];

  const since = new Date(now.getTime() - 400 * MS_PER_WEEK).toISOString();
  const { data: bookings, error } = await supabaseAdmin
    .from("bookings")
    .select(
      `
      id,
      customer_id,
      completed_at,
      providers!inner ( id, business_name, slug ),
      booking_services (
        id,
        offering:offerings!inner (
          id,
          title,
          reminder_to_rebook_enabled,
          reminder_to_rebook_weeks
        )
      )
    `
    )
    .eq("status", "completed")
    .not("completed_at", "is", null)
    .gte("completed_at", since);

  if (error) throw error;
  if (!bookings?.length) {
    return { success: true, rebookRemindersSent: 0 };
  }

  for (const booking of bookings as any[]) {
    const completedRaw = booking.completed_at as string;
    const completedAt = new Date(completedRaw);
    const provider = booking.providers as { business_name?: string; slug?: string } | null;
    const providerName = provider?.business_name || "your provider";
    const providerSlug = provider?.slug || "";

    for (const bs of booking.booking_services || []) {
      const off = bs?.offering;
      if (!off?.reminder_to_rebook_enabled) continue;
      const weeks = Math.max(1, Number(off.reminder_to_rebook_weeks) || 4);
      const target = new Date(completedAt.getTime() + weeks * MS_PER_WEEK);
      const targetDayUtc = Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate());
      if (targetDayUtc !== startOfTodayUtc) continue;

      const reminderKey = `rebook_${booking.id}_${off.id}_${weeks}`;
      const { data: existing } = await supabaseAdmin
        .from("notifications")
        .select("id")
        .eq("user_id", booking.customer_id)
        .eq("type", "rebook_reminder")
        .contains("metadata", { reminder_key: reminderKey })
        .limit(1);
      if (existing && existing.length > 0) continue;

      const serviceTitle = (off.title as string) || "Service";
      const bookingUrlPath = providerSlug
        ? `/book/${encodeURIComponent(providerSlug)}?service=${encodeURIComponent(off.id)}`
        : `/book`;

      const { insertNotification: insertRebookNotification } = await import("@/lib/notifications/insert-notification");
      await insertRebookNotification({
        user_id: booking.customer_id,
        type: "rebook_reminder",
        title: "Time to book again?",
        message: `It may be time to book ${serviceTitle} again with ${providerName}.`,
        data: {
          reminder_key: reminderKey,
          booking_id: booking.id,
          offering_id: off.id,
          weeks: weeks,
        },
        action_url: bookingUrlPath,
      });

      try {
        await sendTemplateNotification(
          "rebook_reminder",
          [booking.customer_id],
          {
            provider_name: providerName,
            service_title: serviceTitle,
            service_id: off.id,
            provider_slug: providerSlug,
            booking_id: booking.id,
            booking_url: bookingUrlPath,
          },
          ["push", "email"],
          { appType: "customer" }
        );
        sent.push(reminderKey);
      } catch (e) {
        console.warn("sendRebookReminders: template send failed", e);
      }
    }
  }

  return { success: true, rebookRemindersSent: sent.length };
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
    const { insertNotification: insertSingleReminder } = await import("@/lib/notifications/insert-notification");
    await insertSingleReminder({
      user_id: booking.customer_id,
      type: "appointment_reminder",
      title: `Appointment Reminder`,
      message: `Your appointment with ${provider.business_name} is coming up. Date: ${dateStr} at ${timeStr}`,
      data: {
        booking_id: booking.id,
        hours_before: hoursBefore,
      },
      action_url: `/account-settings/bookings/${booking.id}`,
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
      ["push", "email"],
      { appType: "customer" }
    );

    return { success: true };
  } catch (error) {
    console.error("Error sending booking reminder:", error);
    throw error;
  }
}
