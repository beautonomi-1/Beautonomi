/**
 * Centralised helper for inserting in-app notification rows.
 *
 * §Notifications-audit 2026-05 — type fidelity
 *
 * The `notification_type` enum was originally 7 values; migrations 413 and
 * 570 extended it to cover everything application code emits today. This
 * helper now passes the type string through unchanged when it's a known
 * enum value, so the bell, deep-link routing, and observability all see
 * the real type (not "system").
 *
 * Older deployments may not have run 570 yet — the helper still maps any
 * unknown value to "system" so `insert` never throws and the bell badge
 * stays accurate. If your DB is up to date, the mapping branch is a no-op.
 */

import { getSupabaseAdmin } from "@/lib/supabase/admin";

// Enum values guaranteed available after migration 413 (already shipped).
const VALID_TYPES_413 = new Set<string>([
  "booking_confirmation",
  "booking_reminder",
  "booking_cancelled",
  "payment_received",
  "review_request",
  "message",
  "system",
  "new_appointment",
  "new_message",
  "booking_update",
  "booking_status_update",
  "booking_rescheduled",
  "booking_staff_changed",
  "appointment_reminder",
  "rebook_reminder",
  "refund_processed",
  "payment_link_sent",
  "additional_charge_paid",
  "new_review",
  "review_response",
  "low_stock_alert",
  "waitlist_available",
  "waitlist_match",
  "marketing_email",
  "custom_offer",
  "provider_custom_offer_declined",
  "customer_custom_offer_withdrawn",
  "customer_custom_offer_expired",
  "custom_request",
  "on_demand_accepted",
  "on_demand_declined",
  "payout_processed",
  "payout_failed",
  "subscription_limit",
  "product_order_update",
  "return_update",
  "staff_assignment",
  "provider_broadcast",
  "high_priority",
  "account_verification",
]);

// Values added by migration 570. We attempt them first; if the DB hasn't
// run 570 yet, the insert fails with `invalid_text_representation` and we
// retry using the legacy fallback map below.
const VALID_TYPES_570 = new Set<string>([
  "admin_broadcast",
  "booking_confirmed",
  "booking_accepted",
  "payment_request",
  "additional_charge_requested",
]);

// Values added by migration 612 (provider membership lifecycle).
const VALID_TYPES_612 = new Set<string>(["provider_membership_cancelled"]);

// Values added by migration 685 (identity verification lifecycle).
const VALID_TYPES_685 = new Set<string>([
  "identity_verification_approved",
  "identity_verification_rejected",
]);

/**
 * Closest 413-valid enum value for any new type. Used when migration 570
 * has not yet run on the target DB so the row is preserved (with slightly
 * lower type fidelity) instead of being silently dropped.
 */
const TYPE_FALLBACK: Record<string, string> = {
  rebook_reminder: "booking_reminder",
  appointment_reminder: "booking_reminder",
  booking_confirmed: "booking_confirmation",
  booking_accepted: "booking_confirmation",
  booking_update: "booking_confirmation",
  booking_status_update: "booking_confirmation",
  booking_rescheduled: "booking_confirmation",
  booking_staff_changed: "booking_confirmation",
  new_appointment: "booking_confirmation",
  payment_request: "payment_received",
  additional_charge_requested: "payment_received",
  refund_processed: "payment_received",
  payment_link_sent: "payment_received",
  additional_charge_paid: "payment_received",
  payout_processed: "payment_received",
  payout_failed: "payment_received",
  new_message: "message",
  new_review: "review_request",
  review_response: "review_request",
  admin_broadcast: "system",
  provider_broadcast: "system",
  custom_offer: "system",
  custom_request: "system",
  provider_membership_cancelled: "system",
  product_order_placed: "product_order_update",
  identity_verification_approved: "account_verification",
  identity_verification_rejected: "account_verification",
};

function normaliseType(raw: string): string {
  if (VALID_TYPES_413.has(raw)) return raw;
  if (VALID_TYPES_570.has(raw)) return raw;
  if (VALID_TYPES_612.has(raw)) return raw;
  if (VALID_TYPES_685.has(raw)) return raw;
  return TYPE_FALLBACK[raw] ?? "system";
}

/**
 * Convert a 570-only type string to the 413-safe fallback so a retry can
 * proceed when the enum upgrade hasn't run yet.
 */
function fallbackTypeFor(raw: string): string {
  return TYPE_FALLBACK[raw] ?? "system";
}

function isInvalidEnumError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const rec = error as Record<string, unknown>;
  const code = typeof rec.code === "string" ? rec.code : "";
  if (code === "22P02") return true;
  const msg = typeof rec.message === "string" ? rec.message.toLowerCase() : "";
  return (
    msg.includes("invalid input value for enum") ||
    msg.includes("invalid input syntax for type")
  );
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

type NotificationRow = {
  user_id: string;
  type: string;
  title: string;
  message: string;
  data: Record<string, unknown>;
  action_url: string | null;
};

function buildRow(input: InsertNotificationInput): NotificationRow {
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
}

function downgradeRow(row: NotificationRow): NotificationRow {
  return { ...row, type: fallbackTypeFor(row.type) };
}

/**
 * Insert a single in-app notification row.
 * Never throws — errors are logged and swallowed so callers don't break.
 */
export async function insertNotification(input: InsertNotificationInput): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();
    const row = buildRow(input);

    const { error } = await supabase.from("notifications").insert(row);
    if (!error) return;

    if (isInvalidEnumError(error) && row.type !== fallbackTypeFor(row.type)) {
      // Migration 570 not yet applied: retry with a 413-safe type.
      const downgraded = downgradeRow(row);
      const { error: retryErr } = await supabase
        .from("notifications")
        .insert(downgraded);
      if (retryErr) {
        console.warn("[insertNotification] retry insert failed:", retryErr.message, {
          user_id: input.user_id,
          requested_type: row.type,
          downgraded_type: downgraded.type,
        });
      }
      return;
    }
    console.warn("[insertNotification] insert failed:", error.message, {
      user_id: input.user_id,
      type: input.type,
    });
  } catch (err) {
    console.warn("[insertNotification] unexpected error:", err);
  }
}

/**
 * Count a user's unread in-app notifications (`notifications` where
 * `is_read = false`). Used to set the exact OS app-icon badge count in push
 * payloads (WhatsApp-style) so the badge is correct even when the app is
 * killed. Never throws — returns 0 on any failure so a badge read can't break
 * a notification send.
 */
export async function getUnreadNotificationCount(userId: string): Promise<number> {
  if (!userId) return 0;
  try {
    const supabase = getSupabaseAdmin();
    const { count, error } = await supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("is_read", false);
    if (error) {
      console.warn("[getUnreadNotificationCount] count failed:", error.message);
      return 0;
    }
    return Math.max(0, count ?? 0);
  } catch (err) {
    console.warn("[getUnreadNotificationCount] unexpected error:", err);
    return 0;
  }
}

/**
 * Insert multiple notifications at once (e.g. notify a whole team).
 *
 * If the DB enum doesn't yet contain a type emitted by this batch (i.e.
 * migration 570 isn't applied), the batch insert is retried row-by-row
 * with the 413-safe fallback so we don't drop the entire batch on one
 * unknown enum value.
 */
export async function insertNotifications(
  inputs: InsertNotificationInput[]
): Promise<void> {
  if (inputs.length === 0) return;
  try {
    const supabase = getSupabaseAdmin();
    const rows = inputs.map(buildRow);

    const { error } = await supabase.from("notifications").insert(rows);
    if (!error) return;

    if (!isInvalidEnumError(error)) {
      console.warn("[insertNotifications] batch insert failed:", error.message);
      return;
    }

    // Retry per-row with a downgraded type so the batch isn't lost.
    const downgraded = rows.map(downgradeRow);
    const { error: retryErr } = await supabase.from("notifications").insert(downgraded);
    if (retryErr) {
      console.warn("[insertNotifications] downgrade retry failed:", retryErr.message);
    }
  } catch (err) {
    console.warn("[insertNotifications] unexpected error:", err);
  }
}
