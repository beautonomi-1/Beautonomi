import type { SupabaseClient } from "@supabase/supabase-js";
import { computeUserNotificationRollup } from "@/lib/notifications/customer-notification-channels";

export const PENDING_MARKETING_CONSENT_KEY = "beautonomi_pending_marketing_consent";

export type PersistMarketingConsentResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Maps signup marketing-consent into notification_preferences.
 * Unchecked (default) unsubscribes marketing sections; checked opts them in.
 */
export function applyMarketingConsentToNotificationPrefs(
  existing: Record<string, unknown> | null | undefined,
  consented: boolean,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...(existing ?? {}) };
  next.unsubscribe_marketing = consented === false;
  const priorOffers =
    next.inspiration_and_offers && typeof next.inspiration_and_offers === "object"
      ? (next.inspiration_and_offers as Record<string, unknown>)
      : {};
  const priorNews =
    next.news_and_programs && typeof next.news_and_programs === "object"
      ? (next.news_and_programs as Record<string, unknown>)
      : {};
  next.inspiration_and_offers = {
    ...priorOffers,
    email: consented,
    sms: consented,
    push: priorOffers.push === true,
  };
  next.news_and_programs = {
    ...priorNews,
    email: consented,
    sms: consented,
    push: priorNews.push === true,
  };
  return next;
}

export function marketingConsentPrivacyPatch(consented: boolean): {
  marketing_consent: boolean;
  receive_marketing: boolean;
} {
  return {
    marketing_consent: consented,
    receive_marketing: consented,
  };
}

/**
 * Persist `privacy_settings.marketing_consent` and feed notification prefs.
 */
export async function persistMarketingConsent(
  supabase: SupabaseClient,
  userId: string,
  marketingConsent: boolean,
): Promise<PersistMarketingConsentResult> {
  const { data: existing, error: loadError } = await supabase
    .from("user_profiles")
    .select("privacy_settings, notification_preferences")
    .eq("user_id", userId)
    .maybeSingle();

  if (loadError && loadError.code !== "PGRST116") {
    return { ok: false, error: loadError.message };
  }

  const currentPrivacy =
    existing?.privacy_settings && typeof existing.privacy_settings === "object"
      ? (existing.privacy_settings as Record<string, unknown>)
      : {};
  const privacy_settings = {
    ...currentPrivacy,
    ...marketingConsentPrivacyPatch(marketingConsent),
  };

  const currentPrefs =
    existing?.notification_preferences && typeof existing.notification_preferences === "object"
      ? (existing.notification_preferences as Record<string, unknown>)
      : {};
  const notification_preferences = applyMarketingConsentToNotificationPrefs(
    currentPrefs,
    marketingConsent,
  );

  if (existing) {
    const { error } = await supabase
      .from("user_profiles")
      .update({ privacy_settings, notification_preferences })
      .eq("user_id", userId);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase.from("user_profiles").insert({
      user_id: userId,
      privacy_settings,
      notification_preferences,
    });
    if (error) return { ok: false, error: error.message };
  }

  try {
    const rollup = computeUserNotificationRollup(notification_preferences);
    await supabase.from("users").update(rollup).eq("id", userId);
  } catch {
    // Rollup is best-effort; privacy_settings is the source of truth.
  }

  return { ok: true };
}
