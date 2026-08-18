import type { SafetySettingKey, SafetySettings } from "@/hooks/useSafetySettings";

const RESTRICTION_KEYS: SafetySettingKey[] = [
  "restricted_mode",
  "hide_social_feed",
  "disable_comments_likes",
  "disable_direct_messaging",
  "sensitive_content_filter",
];

/** Count enabled content-safety restrictions (excludes require_device_auth). */
export function countActiveSafetyRestrictions(settings: SafetySettings): number {
  return RESTRICTION_KEYS.filter((k) => settings[k]).length;
}

export function maskPhoneForDisplay(phone: string | null | undefined): string | null {
  const raw = (phone ?? "").trim();
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 4) return raw;
  const last4 = digits.slice(-4);
  if (raw.startsWith("+")) {
    const ccLen = Math.min(3, digits.length - 4);
    const cc = digits.slice(0, ccLen);
    return `+${cc} ••• ••• ${last4}`;
  }
  return `••• ••• ${last4}`;
}

export function hasEmergencyContact(profile: {
  emergency_contact?: {
    name?: string | null;
    phone?: string | null;
  } | null;
} | null | undefined): boolean {
  const ec = profile?.emergency_contact;
  return Boolean(ec?.name?.trim() && ec?.phone?.trim());
}
