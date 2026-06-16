import type { SupabaseClient } from "@supabase/supabase-js";

export type NotificationChannelName = "push" | "email" | "sms";

type SectionPrefs = { email?: boolean; sms?: boolean; push?: boolean };

/**
 * Provider preference sections, mirroring the defaults returned by
 * `/api/provider/notification-preferences`. Stored on
 * `user_profiles.notification_preferences` per provider user (owner or staff —
 * each authenticated user has their own row, so this also respects per-staff
 * opt-outs made from the provider app).
 */
const DEFAULT_PREFS: Record<string, SectionPrefs> = {
  booking_updates: { email: true, sms: true, push: true },
  booking_cancellations: { email: true, sms: true, push: true },
  booking_reminders: { email: true, sms: true, push: true },
  new_reviews: { email: true, sms: false, push: true },
  review_responses: { email: true, sms: false, push: true },
  client_messages: { email: true, sms: true, push: true },
  payment_received: { email: true, sms: false, push: true },
  payout_updates: { email: true, sms: true, push: true },
  waitlist_notifications: { email: true, sms: false, push: true },
  system_updates: { email: true, sms: false, push: false },
  marketing: { email: true, sms: false, push: false },
};

const MARKETING_SECTION_SET = new Set<string>(["marketing", "system_updates"]);

function mergeSection(
  prefs: Record<string, unknown> | null | undefined,
  section: string,
): SectionPrefs {
  const base = DEFAULT_PREFS[section] ?? { email: true, sms: true, push: true };
  const row = prefs?.[section] as SectionPrefs | undefined;
  return { ...base, ...row };
}

/**
 * Map a provider-facing template key to its preference section. Defaults to a
 * transactional section (`booking_updates`) so an unmapped key is never
 * silently suppressed — `isMustDeliverPushTemplate()` still force-delivers
 * critical pushes regardless of preference.
 */
export function providerTemplateKeyToPreferenceSection(templateKey: string): string {
  const key = templateKey.toLowerCase();
  if (key.includes("cancel")) return "booking_cancellations";
  if (key.includes("reminder")) return "booking_reminders";
  if (
    key === "customer_new_message" ||
    key === "provider_new_message" ||
    key === "new_message"
  ) {
    return "client_messages";
  }
  if (key.includes("review_response") || key === "review_response") return "review_responses";
  if (key.includes("review")) return "new_reviews";
  if (key.includes("payout")) return "payout_updates";
  if (key.includes("payment") || key.includes("charge") || key.includes("refund")) {
    return "payment_received";
  }
  if (key.includes("waitlist")) return "waitlist_notifications";
  if (
    key.includes("subscription") ||
    key.includes("low_stock") ||
    key.includes("system") ||
    key.includes("onboarding") ||
    key.includes("profile_approved") ||
    key.includes("profile_rejected")
  ) {
    return "system_updates";
  }
  if (key.includes("promo") || key.includes("marketing")) return "marketing";
  return "booking_updates";
}

function channelAllowedForProvider(
  prefs: Record<string, unknown> | null | undefined,
  templateKey: string,
  channel: NotificationChannelName,
): boolean {
  const section = providerTemplateKeyToPreferenceSection(templateKey);
  const sec = mergeSection(prefs, section);

  if (prefs?.unsubscribe_marketing === true && MARKETING_SECTION_SET.has(section)) {
    if (channel === "email") return false;
  }

  if (channel === "email") return sec.email !== false;
  if (channel === "sms") return sec.sms !== false;
  if (channel === "push") return sec.push !== false;
  return true;
}

/**
 * For a batch of provider users, resolve the requested channels each recipient
 * individually allows. Returns a `Map<userId, allowedChannels[]>`. Used for
 * per-recipient channels (email/SMS via the durable queue) so a single staff
 * opt-out doesn't suppress the channel for other recipients.
 */
export async function resolveChannelsPerProviderRecipient(
  supabase: SupabaseClient,
  userIds: string[],
  templateKey: string,
  requested: NotificationChannelName[],
): Promise<Map<string, NotificationChannelName[]>> {
  const out = new Map<string, NotificationChannelName[]>();
  if (userIds.length === 0 || requested.length === 0) return out;

  const { data: profiles } = await supabase
    .from("user_profiles")
    .select("user_id, notification_preferences")
    .in("user_id", userIds);

  const profileByUser = new Map<string, Record<string, unknown> | null>(
    (profiles ?? []).map((p) => [
      p.user_id as string,
      (p.notification_preferences as Record<string, unknown>) ?? null,
    ]),
  );

  for (const uid of userIds) {
    const pref = profileByUser.get(uid) ?? null;
    out.set(
      uid,
      requested.filter((ch) => channelAllowedForProvider(pref, templateKey, ch)),
    );
  }
  return out;
}

/**
 * For a batch of provider users, return channels allowed for every recipient
 * (OneSignal sends one payload per call). Mirrors the customer resolver.
 */
export async function intersectChannelsForProviderRecipients(
  supabase: SupabaseClient,
  userIds: string[],
  templateKey: string,
  requested: NotificationChannelName[],
): Promise<NotificationChannelName[]> {
  if (userIds.length === 0 || requested.length === 0) return [];
  const perUser = await resolveChannelsPerProviderRecipient(supabase, userIds, templateKey, requested);
  return requested.filter((ch) => userIds.every((uid) => (perUser.get(uid) ?? []).includes(ch)));
}
