import type { SupabaseClient } from "@supabase/supabase-js";

const CUSTOMER_PUSH_SECTIONS = ["messages", "account_activity", "reminders"] as const;
const PROVIDER_PUSH_SECTIONS = [
  "booking_updates",
  "booking_cancellations",
  "client_messages",
] as const;

function hasExplicitPushOptOut(prefs: Record<string, unknown>): boolean {
  for (const [key, val] of Object.entries(prefs)) {
    if (typeof val !== "object" || val === null || Array.isArray(val)) continue;
    const push = (val as { push?: boolean }).push;
    if (push === false) return true;
  }
  return false;
}

function hasAnyStoredPushKey(prefs: Record<string, unknown>): boolean {
  for (const [key, val] of Object.entries(prefs)) {
    if (typeof val !== "object" || val === null || Array.isArray(val)) continue;
    if ("push" in (val as object)) return true;
  }
  return false;
}

/**
 * After first device register + OS permission, enable recommended push sections once.
 * Skips when the user already stored an explicit push opt-out.
 */
export async function maybeEnablePushSectionsAfterDeviceRegister(
  supabase: SupabaseClient,
  userId: string,
  appType: "customer" | "provider",
): Promise<void> {
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("notification_preferences")
    .eq("user_id", userId)
    .maybeSingle();

  const prefs = (profile?.notification_preferences as Record<string, unknown> | null) ?? null;
  if (!prefs || Object.keys(prefs).length === 0) return;
  if (hasExplicitPushOptOut(prefs)) return;
  if (hasAnyStoredPushKey(prefs)) return;

  const sections =
    appType === "provider" ? PROVIDER_PUSH_SECTIONS : CUSTOMER_PUSH_SECTIONS;
  const next: Record<string, unknown> = { ...prefs };
  for (const section of sections) {
    const row =
      next[section] && typeof next[section] === "object"
        ? { ...(next[section] as Record<string, unknown>) }
        : {};
    if (row.push !== false) {
      row.push = true;
      next[section] = row;
    }
  }

  await supabase
    .from("user_profiles")
    .update({ notification_preferences: next })
    .eq("user_id", userId);

  if (appType === "customer") {
    const { computeUserNotificationRollup } = await import(
      "@/lib/notifications/customer-notification-channels"
    );
    const rollup = computeUserNotificationRollup(next);
    await supabase.from("users").update(rollup).eq("id", userId);
  }
}
