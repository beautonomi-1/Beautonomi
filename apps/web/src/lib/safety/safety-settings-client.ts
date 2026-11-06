import { deleteFetcherGetCacheEntriesMatching, fetcher } from "@/lib/http/fetcher";
import type { ExploreNavAgeBand } from "@/lib/explore/explore-visibility";

export const SAFETY_SETTINGS_URL = "/api/me/safety-settings";
export const VIEWER_SAFETY_SETTINGS_EVENT = "beautonomi:viewer-safety-settings";

export const SAFETY_SETTING_KEYS = [
  "restricted_mode",
  "hide_social_feed",
  "disable_comments_likes",
  "disable_direct_messaging",
  "sensitive_content_filter",
  "require_device_auth",
] as const;

export type SafetySettingKey = (typeof SAFETY_SETTING_KEYS)[number];

export type AgeSource = "under_age_flag" | "verified_dob" | "declared_dob" | "device_signal" | "none";

export interface SafetySettingsSnapshot {
  settings: Record<SafetySettingKey, boolean>;
  locked: Record<SafetySettingKey, boolean>;
  age_band: ExploreNavAgeBand;
  age_source: AgeSource;
}

type SafetySettingsPayload = Partial<Record<SafetySettingKey, boolean>> & {
  locked?: Partial<Record<SafetySettingKey, boolean>>;
  age_band?: unknown;
  age_source?: unknown;
};

const RESTRICTION_KEYS: SafetySettingKey[] = [
  "restricted_mode",
  "hide_social_feed",
  "disable_comments_likes",
  "disable_direct_messaging",
  "sensitive_content_filter",
];

export function normalizeAgeBand(raw: unknown): ExploreNavAgeBand {
  if (raw === "under_13" || raw === "13_17" || raw === "18_plus" || raw === "unknown") return raw;
  return "unknown";
}

function normalizeAgeSource(raw: unknown): AgeSource {
  if (
    raw === "under_age_flag" ||
    raw === "verified_dob" ||
    raw === "declared_dob" ||
    raw === "device_signal" ||
    raw === "none"
  ) {
    return raw;
  }
  return "none";
}

export function parseSafetySettingsPayload(data: SafetySettingsPayload | null | undefined): SafetySettingsSnapshot {
  const settings = {} as Record<SafetySettingKey, boolean>;
  const locked = {} as Record<SafetySettingKey, boolean>;
  for (const key of SAFETY_SETTING_KEYS) {
    settings[key] = data?.[key] === true;
    locked[key] = data?.locked?.[key] === true;
  }
  return {
    settings,
    locked,
    age_band: normalizeAgeBand(data?.age_band),
    age_source: normalizeAgeSource(data?.age_source),
  };
}

/** Same count as the mobile safety hub (excludes require_device_auth). */
export function countActiveSafetyRestrictions(settings: Record<SafetySettingKey, boolean>): number {
  return RESTRICTION_KEYS.filter((k) => settings[k]).length;
}

/** Locked keys are managed by the age policy; the PATCH route rejects any change to them. */
export function canToggleSafetySetting(snapshot: SafetySettingsSnapshot, key: SafetySettingKey): boolean {
  return snapshot.locked[key] !== true;
}

export interface RememberedViewerSafety {
  userId: string;
  hide_social_feed: boolean;
  age_band: ExploreNavAgeBand;
}

let rememberedViewerSafety: RememberedViewerSafety | null = null;

/** Last settings applied for this browser tab, so a newly mounted nav does not fail-open while it refetches. */
export function rememberViewerSafety(
  userId: string,
  value: { hide_social_feed: boolean; age_band: ExploreNavAgeBand },
): void {
  rememberedViewerSafety = {
    userId,
    hide_social_feed: value.hide_social_feed === true,
    age_band: value.age_band,
  };
}

export function rememberViewerSafetyFromSnapshot(userId: string, snapshot: SafetySettingsSnapshot): void {
  rememberViewerSafety(userId, {
    hide_social_feed: snapshot.settings.hide_social_feed === true,
    age_band: snapshot.age_band,
  });
}

export function readRememberedViewerSafety(userId: string): RememberedViewerSafety | null {
  return rememberedViewerSafety?.userId === userId ? rememberedViewerSafety : null;
}

export function clearRememberedViewerSafety(): void {
  rememberedViewerSafety = null;
}

export async function fetchSafetySettings(): Promise<SafetySettingsSnapshot> {
  const body = await fetcher.get<{ data: SafetySettingsPayload | null }>(SAFETY_SETTINGS_URL, {
    staleTimeMs: 0,
    cache: "no-store",
    timeoutMs: 15_000,
  });
  return parseSafetySettingsPayload(body?.data);
}

export async function patchSafetySetting(key: SafetySettingKey, value: boolean): Promise<SafetySettingsSnapshot> {
  const body = await fetcher.patch<{ data: SafetySettingsPayload | null }>(SAFETY_SETTINGS_URL, { [key]: value });
  const snapshot = parseSafetySettingsPayload(body?.data);
  publishViewerSafetySettings(snapshot);
  return snapshot;
}

/** Push fresh settings to every mounted Explore nav (account navbar and public header). */
export function publishViewerSafetySettings(snapshot: SafetySettingsSnapshot): void {
  deleteFetcherGetCacheEntriesMatching(SAFETY_SETTINGS_URL);
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<SafetySettingsSnapshot>(VIEWER_SAFETY_SETTINGS_EVENT, { detail: snapshot }));
}

/** Re-read effective settings (e.g. after a date-of-birth change moves the age band) and publish them. */
export async function refreshViewerSafetySettings(): Promise<SafetySettingsSnapshot | null> {
  try {
    const snapshot = await fetchSafetySettings();
    publishViewerSafetySettings(snapshot);
    return snapshot;
  } catch {
    return null;
  }
}
