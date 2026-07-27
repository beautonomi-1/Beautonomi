import { useCallback, useRef, useState } from "react";
import { Alert } from "react-native";
import { useFocusEffect } from "expo-router";
import { i18n } from "@beautonomi/i18n";
import { api } from "@/lib/api-client";
import { useAuth } from "@/providers/AuthProvider";

export type SafetySettingKey =
  | "restricted_mode"
  | "hide_social_feed"
  | "disable_comments_likes"
  | "disable_direct_messaging"
  | "sensitive_content_filter"
  | "require_device_auth";

export type AgeBand = "under_13" | "13_17" | "18_plus" | "unknown";

export type AgeBandSource =
  | "verified_dob"
  | "declared_dob"
  | "device_signal"
  | "under_age_flag"
  | "none";

export type SocialCapability =
  | "ugc_create"
  | "comment"
  | "like_or_save"
  | "direct_message"
  | "review";

export type SafetySettings = Record<SafetySettingKey, boolean>;

export type SafetySettingsLocked = Record<SafetySettingKey, boolean>;

const SETTING_KEYS: SafetySettingKey[] = [
  "restricted_mode",
  "hide_social_feed",
  "disable_comments_likes",
  "disable_direct_messaging",
  "sensitive_content_filter",
  "require_device_auth",
];

const DEFAULT_SETTINGS: SafetySettings = {
  restricted_mode: false,
  hide_social_feed: false,
  disable_comments_likes: false,
  disable_direct_messaging: false,
  sensitive_content_filter: false,
  require_device_auth: false,
};

const DEFAULT_LOCKED: SafetySettingsLocked = {
  restricted_mode: false,
  hide_social_feed: false,
  disable_comments_likes: false,
  disable_direct_messaging: false,
  sensitive_content_filter: false,
  require_device_auth: false,
};

interface SafetySettingsApiResponse extends Partial<SafetySettings> {
  locked?: Partial<SafetySettingsLocked>;
  age_band?: AgeBand;
  age_source?: AgeBandSource;
}

function mergeSettingsPayload(raw: unknown): {
  settings: SafetySettings;
  locked: SafetySettingsLocked;
  age_band: AgeBand;
  age_source: AgeBandSource;
} {
  const d = (raw && typeof raw === "object" ? raw : {}) as SafetySettingsApiResponse;
  const settings = { ...DEFAULT_SETTINGS };
  const locked = { ...DEFAULT_LOCKED };

  for (const key of SETTING_KEYS) {
    if (typeof d[key] === "boolean") settings[key] = d[key];
    if (d.locked && typeof d.locked[key] === "boolean") locked[key] = d.locked[key];
  }

  const age_band =
    d.age_band === "under_13" ||
    d.age_band === "13_17" ||
    d.age_band === "18_plus" ||
    d.age_band === "unknown"
      ? d.age_band
      : "unknown";

  const age_source =
    d.age_source === "verified_dob" ||
    d.age_source === "declared_dob" ||
    d.age_source === "device_signal" ||
    d.age_source === "under_age_flag" ||
    d.age_source === "none"
      ? d.age_source
      : "none";

  return { settings, locked, age_band, age_source };
}

function capabilityBlocked(settings: SafetySettings, capability: SocialCapability): boolean {
  switch (capability) {
    case "comment":
    case "like_or_save":
      return settings.disable_comments_likes;
    case "direct_message":
      return settings.disable_direct_messaging;
    case "review":
    case "ugc_create":
      return settings.restricted_mode;
    default:
      return false;
  }
}

export function useSafetySettings() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<SafetySettings>(DEFAULT_SETTINGS);
  const [locked, setLocked] = useState<SafetySettingsLocked>(DEFAULT_LOCKED);
  const [age_band, setAgeBand] = useState<AgeBand>("unknown");
  const [age_source, setAgeSource] = useState<AgeBandSource>("none");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<SafetySettingKey | null>(null);
  const canQuietRefresh = useRef(false);

  const refresh = useCallback(async () => {
    if (!user) {
      setSettings(DEFAULT_SETTINGS);
      setLocked(DEFAULT_LOCKED);
      setAgeBand("unknown");
      setAgeSource("none");
      setLoading(false);
      setError(null);
      return;
    }

    const quiet = canQuietRefresh.current;
    if (!quiet) {
      setLoading(true);
      setError(null);
    }

    try {
      const res = await api.get<SafetySettingsApiResponse>("/api/me/safety-settings");
      if (res.error) {
        if (!quiet) setError(res.error.message || i18n.t("customer.mobile.screens.contentSafety.loadFailed"));
      } else if (res.data) {
        const merged = mergeSettingsPayload(res.data);
        setSettings(merged.settings);
        setLocked(merged.locked);
        setAgeBand(merged.age_band);
        setAgeSource(merged.age_source);
        if (!quiet) setError(null);
        canQuietRefresh.current = true;
      }
    } catch (e) {
      if (!quiet) {
        setError(e instanceof Error ? e.message : i18n.t("customer.mobile.screens.contentSafety.loadFailed"));
      }
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      canQuietRefresh.current = false;
      void refresh();
    }, [refresh]),
  );

  const toggle = useCallback(
    async (key: SafetySettingKey, value: boolean) => {
      if (!user || locked[key]) return;

      const previousSettings = settings;
      const previousLocked = locked;
      const nextSettings = { ...settings, [key]: value };
      setSettings(nextSettings);
      setSavingKey(key);

      try {
        const res = await api.patch<SafetySettingsApiResponse>("/api/me/safety-settings", {
          [key]: value,
        });
        if (res.error) {
          setSettings(previousSettings);
          setLocked(previousLocked);
          Alert.alert(
            i18n.t("customer.mobile.screens.authLogin.errorTitle"),
            res.error.message || i18n.t("customer.mobile.screens.contentSafety.updateErrorBody"),
          );
        } else if (res.data) {
          const merged = mergeSettingsPayload(res.data);
          setSettings(merged.settings);
          setLocked(merged.locked);
          setAgeBand(merged.age_band);
          setAgeSource(merged.age_source);
        }
      } catch {
        setSettings(previousSettings);
        setLocked(previousLocked);
        Alert.alert(
          i18n.t("customer.mobile.screens.authLogin.errorTitle"),
          i18n.t("customer.mobile.screens.contentSafety.updateErrorBody"),
        );
      } finally {
        setSavingKey(null);
      }
    },
    [user, settings, locked],
  );

  return {
    settings,
    locked,
    age_band,
    age_source,
    loading,
    error,
    refresh,
    toggle,
    savingKey,
  };
}

export function useSocialCapability(capability: SocialCapability): {
  allowed: boolean;
  reason: string | null;
} {
  const { settings, age_band, loading } = useSafetySettings();

  if (loading) {
    return { allowed: true, reason: null };
  }

  if (age_band === "under_13") {
    return { allowed: false, reason: "under_13" };
  }

  if (capabilityBlocked(settings, capability)) {
    return { allowed: false, reason: capability };
  }

  return { allowed: true, reason: null };
}
