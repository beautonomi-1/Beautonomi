/**
 * Centralised helper for inserting in-app notification rows.
 *
 * WHY THIS EXISTS
 * The notifications.type column is a Postgres enum (notification_type) that was
 * originally defined with only 7 values.  Application code grew to use ~30+ type
 * strings that are NOT in the enum, so every insert threw a constraint error and
 * was silently swallowed — leaving the notifications table empty.
 *
 * This helper:
 *  1. Maps extended type strings → the nearest valid enum value so inserts succeed
 *     with the current schema (migration 413 later adds all values to the enum
 *     — run it once from the Supabase SQL editor when convenient).
 *  2. Accepts both `metadata` and `data` (merges them into the `data` column).
 *  3. Accepts both `link` and `action_url` (maps to `action_url`).
 */

import { getSupabaseAdmin } from "@/lib/supabase/admin";

// The 7 values that currently exist in the notification_type enum.
const VALID_TYPES = new Set([
  "booking_confirmation",
  "booking_reminder",
  "booking_cancelled",
  "payment_received",
  "review_request",
  "message",
  "system",
] as const);

/** Extended type strings → closest valid enum value */
const TYPE_MAP: Record<string, string> = {
  // Booking
  new_appointment: "booking_confirmation",
  booking_update: "booking_confirmation",
  booking_status_update: "booking_confirmation",
  booking_rescheduled: "booking_confirmation",
  booking_staff_changed: "booking_confirmation",
  booking_confirmed: "booking_confirmation",
  booking_accepted: "booking_confirmation",
  // Reminders
  appointment_reminder: "booking_reminder",
  rebook_reminder: "booking_reminder",
  // Payments
  refund_processed: "payment_received",
  payment_link_sent: "payment_received",
  additional_charge_paid: "payment_received",
  payout_processed: "payment_received",
  payout_failed: "payment_received",
  // Messages
  new_message: "message",
  // Reviews
  new_review: "review_request",
  review_response: "review_request",
  // Catch-all
  low_stock_alert: "system",
  waitlist_available: "system",
  waitlist_match: "system",
  marketing_email: "system",
  custom_offer: "system",
  custom_request: "system",
  on_demand_accepted: "system",
  on_demand_declined: "system",
  subscription_limit: "system",
  product_order_update: "system",
  return_update: "system",
  staff_assignment: "system",
  provider_broadcast: "system",
  high_priority: "system",
  account_verification: "system",
};

function normaliseType(raw: string): string {
  if (VALID_TYPES.has(raw as never)) return raw;
  return TYPE_MAP[raw] ?? "system";
}

export interface InsertNotificationInput {
  user_id: string;
  /** Any type string — mapped to the nearest valid enum value automatically. */
  type: string;
  title: string;
  message: string;
  /** Payload data (merged with `metadata` if both supplied). */
  data?: Record<string, unknown>;
  /** Alias for `data` — merged in. */
  metadata?: Record<string, unknown>;
  /** Destination URL inside the app — stored in `action_url`. */
  action_url?: string;
  /** Alias for `action_url`. */
  link?: string;
}

/**
 * Insert a single in-app notification row.
 * Never throws — errors are logged and swallowed so callers don't break.
 */
export async function insertNotification(input: InsertNotificationInput): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();

    const mergedData = {
      ...(input.data ?? {}),
      ...(input.metadata ?? {}),
    };
    const actionUrl = input.action_url ?? input.link ?? null;

    const { error } = await supabase.from("notifications").insert({
      user_id: input.user_id,
      type: normaliseType(input.type),
      title: input.title,
      message: input.message,
      data: Object.keys(mergedData).length > 0 ? mergedData : {},
      action_url: actionUrl,
    });

    if (error) {
      console.warn("[insertNotification] insert failed:", error.message, {
        user_id: input.user_id,
        type: input.type,
      });
    }
  } catch (err) {
    console.warn("[insertNotification] unexpected error:", err);
  }
}

/**
 * Insert multiple notifications at once (e.g. notify a whole team).
 */
export async function insertNotifications(
  inputs: InsertNotificationInput[]
): Promise<void> {
  if (inputs.length === 0) return;
  try {
    const supabase = getSupabaseAdmin();

    const rows = inputs.map((input) => {
      const mergedData = {
        ...(input.data ?? {}),
        ...(input.metadata ?? {}),
      };
      return {
        user_id: input.user_id,
        type: normaliseType(input.type),
        title: input.title,
        message: input.message,
        data: Object.keys(mergedData).length > 0 ? mergedData : {},
        action_url: input.action_url ?? input.link ?? null,
      };
    });

    const { error } = await supabase.from("notifications").insert(rows);
    if (error) {
      console.warn("[insertNotifications] batch insert failed:", error.message);
    }
  } catch (err) {
    console.warn("[insertNotifications] unexpected error:", err);
  }
}
