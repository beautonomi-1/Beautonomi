import type { SupabaseClient } from "@supabase/supabase-js";

const REMINDER_TTL_HOURS = 72;

/** Must match Twilio Content quick-reply button ids on `booking_reminder_24h`. */
export const REMINDER_BUTTON_IDS = {
  confirm: "c1",
  reschedule: "r1",
  cancel: "x1",
} as const;

/**
 * Maps Twilio quick-reply ButtonPayload ids to a booking for 24h reminders.
 * Uses fixed ids (c1/r1/x1) per approved template; last reminder send wins per id.
 */
export async function seedBookingReminderButtonIntents(
  supabase: SupabaseClient,
  bookingId: string,
  userId: string | null,
): Promise<{ confirmId: string; rescheduleId: string; cancelId: string }> {
  const expiresAt = new Date(Date.now() + REMINDER_TTL_HOURS * 60 * 60 * 1000).toISOString();
  const { confirm, reschedule, cancel } = REMINDER_BUTTON_IDS;

  const rows = [
    { id: confirm, action: "confirm", booking_id: bookingId, user_id: userId, expires_at: expiresAt },
    { id: reschedule, action: "reschedule", booking_id: bookingId, user_id: userId, expires_at: expiresAt },
    { id: cancel, action: "cancel", booking_id: bookingId, user_id: userId, expires_at: expiresAt },
  ];

  await supabase.from("whatsapp_button_intents").upsert(rows, { onConflict: "id" });
  return { confirmId: confirm, rescheduleId: reschedule, cancelId: cancel };
}
