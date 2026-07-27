import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AgeBand,
  EffectiveSafetySettings,
  SafetySettingsStored,
} from "./types";
import { resolveAgeAssurancePolicy } from "./age-policy";

const SETTING_KEYS = [
  "restricted_mode",
  "hide_social_feed",
  "disable_comments_likes",
  "disable_direct_messaging",
  "sensitive_content_filter",
  "require_device_auth",
] as const;

type SettingKey = (typeof SETTING_KEYS)[number];

const DEFAULTS: Record<SettingKey, boolean> = {
  restricted_mode: false,
  hide_social_feed: false,
  disable_comments_likes: false,
  disable_direct_messaging: false,
  sensitive_content_filter: false,
  require_device_auth: false,
};

function normalizeStored(raw: unknown): SafetySettingsStored {
  if (!raw || typeof raw !== "object") return {};
  const obj = raw as Record<string, unknown>;
  const out: SafetySettingsStored = {};
  for (const key of SETTING_KEYS) {
    if (typeof obj[key] === "boolean") {
      out[key] = obj[key];
    }
  }
  return out;
}

export async function readSafetySettingsStored(
  userId: string,
  supabase: SupabaseClient,
): Promise<SafetySettingsStored> {
  const { data, error } = await supabase
    .from("user_profiles")
    .select("safety_settings")
    .eq("user_id", userId)
    .maybeSingle();

  if (error && error.code !== "PGRST116") throw error;
  return normalizeStored(data?.safety_settings);
}

export async function writeSafetySettingsStored(
  userId: string,
  supabase: SupabaseClient,
  patch: SafetySettingsStored,
): Promise<SafetySettingsStored> {
  const current = await readSafetySettingsStored(userId, supabase);
  const merged = { ...current, ...patch };

  const { data: existing } = await supabase
    .from("user_profiles")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("user_profiles")
      .update({ safety_settings: merged })
      .eq("user_id", userId);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from("user_profiles")
      .insert({ user_id: userId, safety_settings: merged });
    if (error) throw error;
  }

  return merged;
}

export async function effectiveSafetySettings(
  band: AgeBand,
  stored: SafetySettingsStored,
  tenantId?: string | null,
): Promise<EffectiveSafetySettings> {
  const policy = await resolveAgeAssurancePolicy(tenantId);
  const forcedDefaults =
    band === "13_17" || band === "unknown"
      ? policy.restrictedModeDefaults
      : {};

  const result = {} as EffectiveSafetySettings;
  for (const key of SETTING_KEYS) {
    const storedVal = stored[key] ?? DEFAULTS[key];
    const forced = forcedDefaults[key];
    const locked = forced !== undefined;
    const value = locked ? Boolean(forced) : storedVal;
    result[key] = { value, locked };
  }
  return result;
}

export function isSocialRestricted(effective: EffectiveSafetySettings): boolean {
  return (
    effective.restricted_mode.value ||
    effective.hide_social_feed.value ||
    effective.disable_comments_likes.value ||
    effective.disable_direct_messaging.value
  );
}

export function capabilityBlocked(
  effective: EffectiveSafetySettings,
  capability: import("./types").SocialCapability,
): boolean {
  switch (capability) {
    case "comment":
    case "like_or_save":
      return effective.disable_comments_likes.value;
    case "direct_message":
      return effective.disable_direct_messaging.value;
    case "review":
    case "ugc_create":
      return effective.restricted_mode.value;
    default:
      return false;
  }
}
