import type { SupabaseClient } from "@supabase/supabase-js";
import { PROVIDER_SECTION_DEFAULTS } from "@/lib/notifications/notification-preferences-defaults";

export type NotificationChannelName = "push" | "email" | "sms" | "whatsapp";

type SectionPrefs = { email?: boolean; sms?: boolean; push?: boolean; whatsapp?: boolean };

const MARKETING_SECTION_SET = new Set<string>(["marketing"]);

function mergeSection(
  prefs: Record<string, unknown> | null | undefined,
  section: string,
): SectionPrefs {
  const base = (PROVIDER_SECTION_DEFAULTS[section] as SectionPrefs | undefined) ?? {
    email: true,
    sms: true,
    push: true,
  };
  const row = prefs?.[section] as SectionPrefs | undefined;
  return { ...base, ...row };
}

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
  if (key.includes("schedule_summary") || key === "staff_schedule_summary") {
    return "booking_reminders";
  }
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

export function channelAllowedForProviderUser(
  prefs: Record<string, unknown> | null | undefined,
  usersRow: { whatsapp_opted_out_at?: string | null; phone?: string | null } | null,
  templateKey: string,
  channel: NotificationChannelName,
): boolean {
  const section = providerTemplateKeyToPreferenceSection(templateKey);
  const sec = mergeSection(prefs, section);

  if (prefs?.unsubscribe_marketing === true && MARKETING_SECTION_SET.has(section)) {
    return false;
  }

  if (channel === "email") return sec.email !== false;
  if (channel === "sms") return sec.sms !== false;
  if (channel === "push") return sec.push !== false;
  if (channel === "whatsapp") {
    if (usersRow?.whatsapp_opted_out_at) return false;
    const phone = typeof usersRow?.phone === "string" ? usersRow.phone.trim() : "";
    if (!phone) return false;
    return sec.whatsapp === true;
  }
  return true;
}

export function isAnyProviderPushSectionEnabled(
  prefs: Record<string, unknown> | null | undefined,
): boolean {
  return Object.keys(PROVIDER_SECTION_DEFAULTS).some(
    (section) => mergeSection(prefs, section).push !== false,
  );
}

export async function resolveChannelsPerProviderRecipient(
  supabase: SupabaseClient,
  userIds: string[],
  templateKey: string,
  requested: NotificationChannelName[],
): Promise<Map<string, NotificationChannelName[]>> {
  const out = new Map<string, NotificationChannelName[]>();
  if (userIds.length === 0 || requested.length === 0) return out;

  const { data: users } = await supabase
    .from("users")
    .select("id, phone, whatsapp_opted_out_at")
    .in("id", userIds);

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

  const userById = new Map((users ?? []).map((u) => [u.id as string, u]));

  for (const uid of userIds) {
    const pref = profileByUser.get(uid) ?? null;
    const userRow = userById.get(uid) ?? null;
    out.set(
      uid,
      requested.filter((ch) => channelAllowedForProviderUser(pref, userRow, templateKey, ch)),
    );
  }
  return out;
}

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
