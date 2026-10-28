/**
 * Appointment Reminders
 * Automated reminder system for upcoming bookings
 */

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { sendTemplateNotification } from "@/lib/notifications/onesignal";
import type { TemplateDispatchChannel } from "@/lib/notifications/channel-types";
import { STAFF_REMINDER_BOOKING_SELECT } from "@/lib/bookings/staff-reminder-booking-select";

export interface ReminderConfig {
  hoursBefore: number[]; // e.g., [24, 2] for 24 hours and 2 hours before
  channels: ("push" | "email" | "sms" | "whatsapp")[];
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
          tenant_id,
          location_type,
          customers:users!bookings_customer_id_fkey(
            id,
            full_name,
            email,
            phone
          ),
          providers!inner(
            id,
            business_name,
            timezone
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

        // Check if reminder already sent. The dedupe key is persisted in the
        // `data` column by insertNotification (the `metadata` column is never
        // written), so we must match on `data` — matching on `metadata` here
        // never hit and let the hourly cron re-send the same reminder.
        const { data: existingNotification } = await supabaseAdmin
          .from("notifications")
          .select("id")
          .eq("user_id", booking.customer_id)
          .eq("type", "appointment_reminder")
          .contains("data", { reminder_key: reminderKey })
          .limit(1);

        if (existingNotification && existingNotification.length > 0) {
          continue; // Already sent
        }

        const _customer = booking.customers as any;
        const provider = booking.providers as any;
        const services = (booking.booking_services || []).map((bs: any) => bs.offering?.title || "Service").join(", ");

        const scheduledDate = new Date(booking.scheduled_at);
        // §Final-audit 2026-04 (B13 residual fix): render reminder date/time
        // in the PROVIDER's IANA timezone so customers see the same wall
        // clock they will be greeted with. Previously these rendered in the
        // Next.js server's locale/timezone, which drifted for any provider
        // outside that region.
        const providerTz =
          (provider?.timezone as string | null | undefined) || "Africa/Johannesburg";
        const dateStr = scheduledDate.toLocaleDateString("en-ZA", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
          timeZone: providerTz,
        });
        const timeStr = scheduledDate.toLocaleTimeString("en-ZA", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
          timeZone: providerTz,
        });

        try {
          const reminderTemplateKey =
            hoursBefore === 24
              ? "booking_reminder_24h"
              : hoursBefore === 2
                ? "booking_reminder_2h"
                : "appointment_reminder";
          const { customerAllowsAnyChannel } = await import(
            "@/lib/notifications/customer-notification-channels"
          );
          const allowsExternal = await customerAllowsAnyChannel(
            supabaseAdmin,
            booking.customer_id,
            reminderTemplateKey,
            config.channels,
          );
          if (!allowsExternal) {
            continue;
          }

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

          const tenantId = (booking as { tenant_id?: string | null }).tenant_id ?? null;
          let channels: TemplateDispatchChannel[] = [...config.channels];
          if (config.channels.includes("whatsapp")) {
            const { customerBookingChannels } = await import(
              "@/lib/notifications/customer-booking-channels"
            );
            channels = await customerBookingChannels(tenantId);
          }

          if (hoursBefore === 24) {
            const { notifyBookingReminder24h } = await import(
              "@/lib/notifications/notification-service"
            );
            await notifyBookingReminder24h(booking.id, channels);
          } else if (hoursBefore === 2) {
            const { notifyBookingReminder2h } = await import(
              "@/lib/notifications/notification-service"
            );
            await notifyBookingReminder2h(booking.id, channels);
          } else {
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
              channels.filter((c) => c !== "whatsapp"),
              { appType: "customer", skipInApp: true, tenantId },
            );
          }

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

  // Only look back far enough to cover the max practical rebook window (52 weeks).
  // Rebook fires when completed_at + weeks == today, so completed_at = today - weeks.
  const MAX_REBOOK_WEEKS = 52;
  const since = new Date(now.getTime() - (MAX_REBOOK_WEEKS + 1) * MS_PER_WEEK).toISOString();
  const PAGE_SIZE = 500;
  let offset = 0;
  let allBookings: any[] = [];

  while (true) {
    const { data: batch, error: batchErr } = await supabaseAdmin
      .from("bookings")
      .select(
        `
        id,
        customer_id,
        tenant_id,
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
      .gte("completed_at", since)
      .order("completed_at", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (batchErr) throw batchErr;
    if (!batch?.length) break;

    allBookings = allBookings.concat(batch);
    offset += PAGE_SIZE;
    if (batch.length < PAGE_SIZE) break;
  }

  const bookings = allBookings;
  if (!bookings.length) {
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
        .contains("data", { reminder_key: reminderKey })
        .limit(1);
      if (existing && existing.length > 0) continue;

      const serviceTitle = (off.title as string) || "Service";
      const bookingUrlPath = providerSlug
        ? `/booking?slug=${encodeURIComponent(providerSlug)}&service=${encodeURIComponent(off.id)}`
        : `/account-settings/bookings`;

      const { customerAllowsAnyChannel } = await import(
        "@/lib/notifications/customer-notification-channels"
      );
      const allowsRebook = await customerAllowsAnyChannel(
        supabaseAdmin,
        booking.customer_id as string,
        "rebook_reminder",
        ["push", "email", "sms"],
      );
      if (!allowsRebook) continue;

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
          await (async () => {
            const tenantId = (booking as { tenant_id?: string | null }).tenant_id ?? null;
            const { customerBookingChannels } = await import(
              "@/lib/notifications/customer-booking-channels"
            );
            return customerBookingChannels(tenantId);
          })(),
          { appType: "customer", skipInApp: true, tenantId: (booking as { tenant_id?: string | null }).tenant_id ?? null }
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
          business_name,
          timezone
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
    const providerTz =
      (provider?.timezone as string | null | undefined) || "Africa/Johannesburg";
    const dateStr = scheduledDate.toLocaleDateString("en-ZA", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: providerTz,
    });
    const timeStr = scheduledDate.toLocaleTimeString("en-ZA", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
      timeZone: providerTz,
    });

    const singleTemplateKey =
      hoursBefore === 24
        ? "booking_reminder_24h"
        : hoursBefore === 2
          ? "booking_reminder_2h"
          : "appointment_reminder";
    const { customerAllowsAnyChannel } = await import(
      "@/lib/notifications/customer-notification-channels"
    );
    const allowsSingle = await customerAllowsAnyChannel(
      supabaseAdmin,
      booking.customer_id,
      singleTemplateKey,
      ["push", "email", "sms"],
    );
    if (!allowsSingle) {
      return { success: true, skipped: "preferences" };
    }

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
      // In-app bell row inserted manually above; skip the template auto-insert.
      { appType: "customer", skipInApp: true }
    );

    return { success: true };
  } catch (error) {
    console.error("Error sending booking reminder:", error);
    throw error;
  }
}

function parseStaffReminderOffsetMs(reminderTime: string): number | null {
  const trimmed = reminderTime.trim().toLowerCase();
  const match = /^(\d+)(h|m)$/.exec(trimmed);
  if (!match) return null;
  const amount = Number.parseInt(match[1], 10);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return match[2] === "h" ? amount * 60 * 60 * 1000 : amount * 60 * 1000;
}

function staffReminderTemplateKey(reminderTime: string): string {
  if (reminderTime === "24h") return "booking_reminder_24h";
  if (reminderTime === "2h") return "booking_reminder_2h";
  return "appointment_reminder";
}

function bookingAssignedToStaff(
  booking: {
    staff_id?: string | null;
    booking_services?: Array<{ staff_id?: string | null } | null> | null;
  },
  staffId: string,
): boolean {
  if (booking.staff_id === staffId) return true;
  for (const row of booking.booking_services ?? []) {
    if (row?.staff_id === staffId) return true;
  }
  return false;
}

function parseStaffNotificationSettings(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  if (typeof raw === "object") return raw as Record<string, unknown>;
  return {};
}

/**
 * Staff-specific appointment reminders driven by provider_staff.notification_settings
 * (appointment_reminders + reminder_time). Runs on the same cron as customer reminders.
 */
export async function sendStaffAppointmentReminders() {
  const supabaseAdmin = getSupabaseAdmin();
  const now = new Date();
  const remindersSent: string[] = [];

  const { data: staffRows, error: staffErr } = await supabaseAdmin
    .from("provider_staff")
    .select(
      `
      id,
      user_id,
      provider_id,
      notification_settings,
      providers!inner (
        id,
        business_name,
        timezone,
        tenant_id
      )
    `,
    )
    .eq("is_active", true)
    .not("user_id", "is", null);

  if (staffErr) {
    throw staffErr;
  }

  type StaffRow = {
    id: string;
    user_id: string;
    provider_id: string;
    notification_settings?: unknown;
    providers: { business_name?: string; timezone?: string | null; tenant_id?: string | null };
  };

  const eligible = ((staffRows ?? []) as StaffRow[]).filter((row) => {
    const settings = parseStaffNotificationSettings(row.notification_settings);
    return settings.appointment_reminders !== false;
  });

  const byProviderReminder = new Map<string, StaffRow[]>();
  for (const row of eligible) {
    const settings = parseStaffNotificationSettings(row.notification_settings);
    const reminderTime = typeof settings.reminder_time === "string" ? settings.reminder_time : "24h";
    const key = `${row.provider_id}:${reminderTime}`;
    const list = byProviderReminder.get(key) ?? [];
    list.push(row);
    byProviderReminder.set(key, list);
  }

  for (const [groupKey, members] of byProviderReminder) {
    const [providerId, reminderTime] = groupKey.split(":");
    const offsetMs = parseStaffReminderOffsetMs(reminderTime);
    if (offsetMs == null) continue;

    const reminderAt = new Date(now.getTime() + offsetMs);
    const windowStart = new Date(reminderAt.getTime() - 30 * 60 * 1000);
    const windowEnd = new Date(reminderAt.getTime() + 30 * 60 * 1000);
    const { data: bookings, error: bookingErr } = await supabaseAdmin
      .from("bookings")
      .select(STAFF_REMINDER_BOOKING_SELECT)
      .eq("provider_id", providerId)
      .eq("status", "confirmed")
      .gte("scheduled_at", windowStart.toISOString())
      .lte("scheduled_at", windowEnd.toISOString())
      .is("cancelled_at", null);

    if (bookingErr) {
      console.error("[sendStaffAppointmentReminders] booking query failed:", bookingErr);
      continue;
    }

    for (const booking of bookings ?? []) {
      const assignedStaff = members.filter((m) => bookingAssignedToStaff(booking as never, m.id));
      if (assignedStaff.length === 0) continue;

      const provider = assignedStaff[0].providers;
      const providerTz = provider?.timezone || "Africa/Johannesburg";
      const customer = (booking as { customers?: { full_name?: string } | null }).customers;
      const customerName = customer?.full_name || "Customer";
      const services = (
        (booking as { booking_services?: Array<{ offering?: { title?: string } }> }).booking_services ??
        []
      )
        .map((bs) => bs.offering?.title || "Service")
        .join(", ");

      const scheduledDate = new Date((booking as { scheduled_at: string }).scheduled_at);
      const dateStr = scheduledDate.toLocaleDateString("en-ZA", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        timeZone: providerTz,
      });
      const timeStr = scheduledDate.toLocaleTimeString("en-ZA", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
        timeZone: providerTz,
      });
      const hoursBefore = Math.round(offsetMs / (60 * 60 * 1000));
      const templateKey = staffReminderTemplateKey(reminderTime);

      for (const staff of assignedStaff) {
        const reminderKey = `staff_reminder_${reminderTime}_${booking.id}_${staff.id}`;
        const { data: existingNotification } = await supabaseAdmin
          .from("notifications")
          .select("id")
          .eq("user_id", staff.user_id)
          .eq("type", "appointment_reminder")
          .contains("data", { reminder_key: reminderKey })
          .limit(1);
        if (existingNotification?.length) continue;

        const { insertNotification } = await import("@/lib/notifications/insert-notification");
        await insertNotification({
          user_id: staff.user_id,
          type: "appointment_reminder",
          title: "Upcoming appointment",
          message: `${customerName} — ${dateStr} at ${timeStr}`,
          data: {
            booking_id: (booking as { id: string }).id,
            reminder_key: reminderKey,
            staff_id: staff.id,
            reminder_time: reminderTime,
          },
          action_url: `/provider/bookings/${(booking as { id: string }).id}`,
        });

        try {
          await sendTemplateNotification(
            templateKey,
            [staff.user_id],
            {
              provider_name: customerName,
              appointment_date: dateStr,
              appointment_time: timeStr,
              services,
              hours_before: String(hoursBefore || reminderTime),
              booking_number: (booking as { booking_number?: string }).booking_number || "",
              booking_id: (booking as { id: string }).id,
            },
            ["push", "email"],
            {
              appType: "provider",
              skipInApp: true,
              tenantId: (booking as { tenant_id?: string | null }).tenant_id ?? null,
            },
          );
          remindersSent.push(reminderKey);
        } catch (notifError) {
          console.error(
            `[sendStaffAppointmentReminders] send failed booking ${(booking as { id: string }).id} staff ${staff.id}:`,
            notifError,
          );
        }
      }
    }
  }

  return {
    success: true,
    staffRemindersSent: remindersSent.length,
  };
}
