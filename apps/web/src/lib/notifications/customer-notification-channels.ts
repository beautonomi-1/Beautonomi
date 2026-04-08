import type { SupabaseClient } from "@supabase/supabase-js";

export type NotificationChannelName = "push" | "email" | "sms";

type SectionPrefs = { email?: boolean; sms?: boolean; push?: boolean };

const DEFAULT_PREFS: Record<string, SectionPrefs> = {
  inspiration_and_offers: { email: true, sms: true, push: false },
  news_and_programs: { email: true, sms: true, push: false },
  feedback: { email: true, sms: false, push: false },
  travel_regulations: { email: true, sms: true, push: false },
  account_activity: { email: true, sms: true, push: false },
  client_policies: { email: true, sms: false, push: false },
  reminders: { email: true, sms: true, push: false },
  subscription_renewal: { email: true, sms: false, push: false },
  messages: { email: true, sms: true, push: true },
};

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

function mergeSection(prefs: Record<string, unknown> | null | undefined, section: string): SectionPrefs {
  const base = DEFAULT_PREFS[section] ?? { email: true, sms: true, push: false };
  const row = prefs?.[section] as SectionPrefs | undefined;
  return { ...base, ...row };
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
  if (
    key.includes("reminder") ||
    key.includes("waitlist") ||
    key.includes("follow_up") ||
    key.includes("review_reminder") ||
    key.includes("en_route") ||
    key.includes("arrival") ||
    key.includes("salon_directions") ||
    key.includes("salon_arrival")
  ) {
    return "reminders";
  }
  if (
    key.includes("welcome_message") ||
    key.includes("referral") ||
    key.includes("recommendation") ||
    key.includes("loyalty") ||
    key.includes("gift_card") ||
    key.includes("promo")
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
} {
  const unsub = prefs.unsubscribe_marketing === true;

  const transactionalEmail = TRANSACTIONAL_SECTIONS.some((s) => mergeSection(prefs, s).email !== false);
  const marketingEmail = MARKETING_SECTIONS.some((s) => mergeSection(prefs, s).email !== false);
  const email_notifications_enabled = transactionalEmail || (!unsub && marketingEmail);

  const smsKeys = [...TRANSACTIONAL_SECTIONS, ...MARKETING_SECTIONS] as string[];
  const sms_notifications_enabled = smsKeys.some((s) => mergeSection(prefs, s).sms !== false);

  const pushKeys = [...TRANSACTIONAL_SECTIONS, ...MARKETING_SECTIONS] as string[];
  const push_notifications_enabled = pushKeys.some((s) => mergeSection(prefs, s).push === true);

  return { email_notifications_enabled, sms_notifications_enabled, push_notifications_enabled };
}

function channelAllowedForUser(
  prefs: Record<string, unknown> | null | undefined,
  usersRow: {
    email_notifications_enabled?: boolean | null;
    sms_notifications_enabled?: boolean | null;
    push_notifications_enabled?: boolean | null;
  } | null,
  templateKey: string,
  channel: NotificationChannelName
): boolean {
  const section = templateKeyToPreferenceSection(templateKey);
  const sec = mergeSection(prefs, section);

  if (prefs?.unsubscribe_marketing === true && MARKETING_SECTION_SET.has(section)) {
    if (channel === "email") return false;
  }

  if (channel === "email") {
    if (usersRow?.email_notifications_enabled === false) return false;
    return sec.email !== false;
  }
  if (channel === "sms") {
    if (usersRow?.sms_notifications_enabled === false) return false;
    return sec.sms !== false;
  }
  if (channel === "push") {
    if (usersRow?.push_notifications_enabled === false) return false;
    return sec.push === true;
  }
  return true;
}

/**
 * For a batch of customers, return channels that are allowed for every recipient (OneSignal sends one payload).
 */
export async function intersectChannelsForCustomerRecipients(
  supabase: SupabaseClient,
  userIds: string[],
  templateKey: string,
  requested: NotificationChannelName[]
): Promise<NotificationChannelName[]> {
  if (userIds.length === 0 || requested.length === 0) return [];

  const { data: users } = await supabase
    .from("users")
    .select("id, email_notifications_enabled, sms_notifications_enabled, push_notifications_enabled")
    .in("id", userIds);

  const { data: profiles } = await supabase
    .from("user_profiles")
    .select("user_id, notification_preferences")
    .in("user_id", userIds);

  const profileByUser = new Map<string, Record<string, unknown> | null>(
    (profiles ?? []).map((p) => [p.user_id as string, (p.notification_preferences as Record<string, unknown>) ?? null])
  );

  const userById = new Map((users ?? []).map((u) => [u.id as string, u]));

  return requested.filter((ch) =>
    userIds.every((uid) => {
      const row = userById.get(uid) ?? null;
      const pref = profileByUser.get(uid) ?? null;
      return channelAllowedForUser(pref, row, templateKey, ch);
    })
  );
}
