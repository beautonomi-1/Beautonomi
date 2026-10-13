import type { SupabaseClient } from "@supabase/supabase-js";
import { CUSTOMER_SECTION_DEFAULTS } from "@/lib/notifications/notification-preferences-defaults";

export type NotificationChannelName = "push" | "email" | "sms" | "whatsapp";

type SectionPrefs = { email?: boolean; sms?: boolean; push?: boolean; whatsapp?: boolean };

const TRANSACTIONAL_SECTIONS = [
  "account_activity",
  "client_policies",
  "reminders",
  "subscription_renewal",
  "messages",
  "feedback",
  "travel_regulations",
] as const;

const MARKETING_SECTIONS = ["inspiration_and_offers", "news_and_programs"] as const;
const MARKETING_SECTION_SET = new Set<string>(MARKETING_SECTIONS);

const INSPIRATION_SECTION_KEYS = new Set([
  "abandoned_cart",
  "abandoned_cart_reminder",
  "abandoned_booking_reminder",
  "rebook_reminder",
  "membership_win_back",
  "automation_promo",
  "welcome_message",
  "promotion_available",
  "referral_bonus_earned",
  "referral_code_used",
  "provider_recommendation",
  "admin_broadcast",
  "provider_broadcast",
  "marketing_email",
  "marketing_campaign",
  "marketing_automation",
  "loyalty_reward_available",
]);

function mergeSection(prefs: Record<string, unknown> | null | undefined, section: string): SectionPrefs {
  const base = (CUSTOMER_SECTION_DEFAULTS[section] as SectionPrefs | undefined) ?? {
    email: true,
    sms: true,
    push: false,
  };
  const row = prefs?.[section] as SectionPrefs | undefined;
  return { ...base, ...row };
}

function isRemindersSectionTemplate(key: string): boolean {
  if (INSPIRATION_SECTION_KEYS.has(key)) return false;
  if (key.startsWith("product_order_") || key.startsWith("product_return_")) return false;
  if (key.startsWith("customer_custom_offer")) return false;
  if (key === "booking_checkout_not_completed") return false;
  if (key === "automation_appointment_reminder") return true;
  if (
    key.includes("appointment_reminder") ||
    key === "booking_reminder_24h" ||
    key === "booking_reminder_2h"
  ) {
    return true;
  }
  if (
    key.includes("waitlist") ||
    key.includes("follow_up") ||
    key.includes("review_reminder") ||
    key.includes("en_route") ||
    key.includes("arrival") ||
    key.includes("salon_directions") ||
    key.includes("salon_arrival")
  ) {
    return true;
  }
  return false;
}

/**
 * Maps a template key to the customer-facing preference section in /account-settings/notifications.
 */
export function templateKeyToPreferenceSection(templateKey: string): string {
  const key = templateKey.toLowerCase();
  if (
    key === "customer_new_message" ||
    key === "provider_new_message" ||
    key === "new_message"
  ) {
    return "messages";
  }
  if (
    key.includes("subscription") ||
    key.includes("membership_renew") ||
    key.includes("membership_cancel")
  ) {
    return "subscription_renewal";
  }
  if (INSPIRATION_SECTION_KEYS.has(key)) {
    return "inspiration_and_offers";
  }
  if (key.startsWith("product_order_") || key.startsWith("product_return_")) {
    return "account_activity";
  }
  if (key === "booking_checkout_not_completed" || key.startsWith("customer_custom_offer")) {
    return "account_activity";
  }
  if (isRemindersSectionTemplate(key)) {
    return "reminders";
  }
  if (key === "loyalty_points_earned" || key === "post_visit_whatsapp") {
    return "account_activity";
  }
  if (
    key.includes("referral") ||
    key.includes("loyalty") ||
    key.includes("gift_card") ||
    (key.includes("promo") && !key.startsWith("automation_"))
  ) {
    return "inspiration_and_offers";
  }
  return "account_activity";
}

/**
 * Roll up JSON notification preferences into users.*_notifications_enabled for legacy send paths.
 */
export function computeUserNotificationRollup(prefs: Record<string, unknown>): {
  email_notifications_enabled: boolean;
  sms_notifications_enabled: boolean;
  push_notifications_enabled: boolean;
  whatsapp_notifications_enabled: boolean;
} {
  const unsub = prefs.unsubscribe_marketing === true;

  if (prefs.email_notifications === false) {
    return {
      email_notifications_enabled: false,
      sms_notifications_enabled: prefs.sms_notifications === false ? false : computeSmsRollup(prefs, unsub),
      push_notifications_enabled: computePushRollup(prefs, unsub),
      whatsapp_notifications_enabled: computeWhatsappRollup(prefs, unsub),
    };
  }

  const transactionalEmail = TRANSACTIONAL_SECTIONS.some((s) => mergeSection(prefs, s).email !== false);
  const marketingEmail = MARKETING_SECTIONS.some((s) => mergeSection(prefs, s).email !== false);
  let email_notifications_enabled = transactionalEmail || (!unsub && marketingEmail);
  if (prefs.email_notifications === false) email_notifications_enabled = false;

  return {
    email_notifications_enabled,
    sms_notifications_enabled:
      prefs.sms_notifications === false ? false : computeSmsRollup(prefs, unsub),
    push_notifications_enabled: computePushRollup(prefs, unsub),
    whatsapp_notifications_enabled: computeWhatsappRollup(prefs, unsub),
  };
}

function computeSmsRollup(prefs: Record<string, unknown>, unsub: boolean): boolean {
  const smsKeys = [...TRANSACTIONAL_SECTIONS, ...MARKETING_SECTIONS] as string[];
  return smsKeys.some((s) => {
    if (unsub && MARKETING_SECTION_SET.has(s)) return false;
    return mergeSection(prefs, s).sms === true;
  });
}

function computePushRollup(prefs: Record<string, unknown>, unsub: boolean): boolean {
  const pushKeys = [...TRANSACTIONAL_SECTIONS, ...MARKETING_SECTIONS] as string[];
  return pushKeys.some((s) => {
    if (unsub && MARKETING_SECTION_SET.has(s)) return false;
    return mergeSection(prefs, s).push === true;
  });
}

function computeWhatsappRollup(prefs: Record<string, unknown>, unsub: boolean): boolean {
  const keys = [...TRANSACTIONAL_SECTIONS, ...MARKETING_SECTIONS] as string[];
  return keys.some((s) => {
    if (unsub && MARKETING_SECTION_SET.has(s)) return false;
    return mergeSection(prefs, s).whatsapp === true;
  });
}

export function channelAllowedForCustomerUser(
  prefs: Record<string, unknown> | null | undefined,
  usersRow: {
    email_notifications_enabled?: boolean | null;
    sms_notifications_enabled?: boolean | null;
    push_notifications_enabled?: boolean | null;
    whatsapp_notifications_enabled?: boolean | null;
    whatsapp_opt_in_at?: string | null;
    whatsapp_opted_out_at?: string | null;
    phone?: string | null;
  } | null,
  templateKey: string,
  channel: NotificationChannelName,
): boolean {
  const section = templateKeyToPreferenceSection(templateKey);

  if (prefs?.booking_reminders === false && section === "reminders") {
    return false;
  }

  const sec = mergeSection(prefs, section);

  if (prefs?.unsubscribe_marketing === true && MARKETING_SECTION_SET.has(section)) {
    return false;
  }

  if (channel === "email") {
    if (prefs?.email_notifications === false) return false;
    if (usersRow?.email_notifications_enabled === false) return false;
    return sec.email !== false;
  }
  if (channel === "sms") {
    if (prefs?.sms_notifications === false) return false;
    if (usersRow?.sms_notifications_enabled === false) return false;
    return sec.sms === true;
  }
  if (channel === "push") {
    if (usersRow?.push_notifications_enabled === false) return false;
    return sec.push === true;
  }
  if (channel === "whatsapp") {
    if (usersRow?.whatsapp_opted_out_at) return false;
    const phone = typeof usersRow?.phone === "string" ? usersRow.phone.trim() : "";
    if (!phone) return false;
    if (usersRow?.whatsapp_notifications_enabled === false) return false;
    if (!usersRow?.whatsapp_opt_in_at && sec.whatsapp !== true) return false;
    return sec.whatsapp !== false;
  }
  return true;
}

/**
 * For a batch of customers, resolve the requested channels each recipient
 * individually allows. Returns a `Map<userId, allowedChannels[]>`.
 */
export async function resolveChannelsPerCustomerRecipient(
  supabase: SupabaseClient,
  userIds: string[],
  templateKey: string,
  requested: NotificationChannelName[],
): Promise<Map<string, NotificationChannelName[]>> {
  const out = new Map<string, NotificationChannelName[]>();
  if (userIds.length === 0 || requested.length === 0) return out;

  const { data: users } = await supabase
    .from("users")
    .select(
      "id, phone, email_notifications_enabled, sms_notifications_enabled, push_notifications_enabled, whatsapp_notifications_enabled, whatsapp_opt_in_at, whatsapp_opted_out_at",
    )
    .in("id", userIds);

  const { data: profiles } = await supabase
    .from("user_profiles")
    .select("user_id, notification_preferences")
    .in("user_id", userIds);

  const profileByUser = new Map<string, Record<string, unknown> | null>(
    (profiles ?? []).map((p) => [p.user_id as string, (p.notification_preferences as Record<string, unknown>) ?? null]),
  );

  const userById = new Map((users ?? []).map((u) => [u.id as string, u]));

  for (const uid of userIds) {
    const row = userById.get(uid) ?? null;
    const pref = profileByUser.get(uid) ?? null;
    out.set(
      uid,
      requested.filter((ch) => channelAllowedForCustomerUser(pref, row, templateKey, ch)),
    );
  }
  return out;
}

/**
 * @deprecated Prefer per-recipient push sends. Kept for callers not yet migrated.
 */
export async function intersectChannelsForCustomerRecipients(
  supabase: SupabaseClient,
  userIds: string[],
  templateKey: string,
  requested: NotificationChannelName[],
): Promise<NotificationChannelName[]> {
  if (userIds.length === 0 || requested.length === 0) return [];
  const perUser = await resolveChannelsPerCustomerRecipient(supabase, userIds, templateKey, requested);
  return requested.filter((ch) => userIds.every((uid) => (perUser.get(uid) ?? []).includes(ch)));
}

/** Whether customer should receive external channels for this template (any requested channel allowed). */
export async function customerAllowsAnyChannel(
  supabase: SupabaseClient,
  userId: string,
  templateKey: string,
  requested: NotificationChannelName[],
): Promise<boolean> {
  const map = await resolveChannelsPerCustomerRecipient(supabase, [userId], templateKey, requested);
  return (map.get(userId) ?? []).length > 0;
}
