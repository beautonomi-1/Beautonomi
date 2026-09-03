import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Clear sent appointment-reminder rows so the cron re-fires for the rescheduled time.
 */
export async function resetBookingReminderNotifications(
  admin: SupabaseClient,
  bookingId: string,
): Promise<void> {
  try {
    await admin
      .from("notifications")
      .delete()
      .eq("type", "appointment_reminder")
      .filter("data->>booking_id", "eq", bookingId);
  } catch (err) {
    console.warn("[resetBookingReminderNotifications] failed:", err);
  }
}
