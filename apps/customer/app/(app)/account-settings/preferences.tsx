import { useEffect, useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  ScrollView,
  Pressable,
  Alert,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/lib/api-client";
import { ScreenFrame } from "@/components/ScreenFrame";
import { Colors } from "@/constants/colors";
import { useTheme } from "@/providers/ThemeProvider";
import {
  DEFAULT_MARKET_HOST,
  GLOBAL_ENTRY_HOST,
  MARKET_HOST_OPTIONS,
  getRuntimeMarketHost,
  setRuntimeMarketHost,
} from "@/config/public-env";
import { useConfigBundle } from "@/providers/ConfigBundleProvider";
import { getTenantDefaultCurrency } from "@/lib/config-bundle";
import { currencySelectLabel, LAST_RESORT_CURRENCY } from "@beautonomi/utils";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface UserProfile {
  preferred_language: string | null;
  preferred_currency: string | null;
  timezone: string | null;
}

interface PickerOption {
  value: string;
  label: string;
}

interface MarketOption {
  host: string;
  label: string;
}

type PreferenceField = "preferred_language" | "preferred_currency" | "timezone";

/** Matches `/api/public/preference-options` rows (same source as web account preferences). */
interface PreferenceOptionRow {
  id: string;
  type: "language" | "currency" | "timezone";
  code: string | null;
  name: string;
  display_order?: number;
}

/* ------------------------------------------------------------------ */
/*  Fallback lists (used when API empty or unavailable — mirrors web resilience) */
/* ------------------------------------------------------------------ */

const LANGUAGE_OPTIONS: PickerOption[] = [
  { value: "en", label: "English" },
  { value: "af", label: "Afrikaans" },
  { value: "zu", label: "Zulu" },
  { value: "xh", label: "Xhosa" },
  { value: "st", label: "Sotho" },
];

const FALLBACK_CURRENCY_OPTIONS: PickerOption[] = [
  { value: LAST_RESORT_CURRENCY, label: currencySelectLabel(LAST_RESORT_CURRENCY) },
  { value: "USD", label: currencySelectLabel("USD") },
  { value: "GBP", label: currencySelectLabel("GBP") },
  { value: "EUR", label: currencySelectLabel("EUR") },
  { value: "KES", label: currencySelectLabel("KES") },
  { value: "NGN", label: currencySelectLabel("NGN") },
  { value: "GHS", label: currencySelectLabel("GHS") },
  { value: "EGP", label: currencySelectLabel("EGP") },
];

const TIMEZONE_OPTIONS: PickerOption[] = [
  { value: "Africa/Johannesburg", label: "Africa/Johannesburg (SAST)" },
  { value: "Africa/Nairobi", label: "Africa/Nairobi (EAT)" },
  { value: "Africa/Lagos", label: "Africa/Lagos (WAT)" },
  { value: "Africa/Accra", label: "Africa/Accra (GMT)" },
  { value: "Africa/Cairo", label: "Africa/Cairo (EET)" },
  { value: "UTC", label: "UTC" },
  { value: "America/New_York", label: "America/New_York (EST)" },
  { value: "Europe/London", label: "Europe/London (GMT)" },
];

function mapPreferenceRowsToPicker(rows: PreferenceOptionRow[] | null | undefined): PickerOption[] {
  if (!rows?.length) return [];
  const out: PickerOption[] = [];
  for (const r of rows) {
    const code = r.code?.trim();
    if (!code) continue;
    const label = (r.name?.trim() || code) as string;
    out.push({ value: code, label });
  }
  return out;
}

function preferApiOrFallback(api: PickerOption[], fallback: PickerOption[]): PickerOption[] {
  return api.length > 0 ? api : fallback;
}

/* ------------------------------------------------------------------ */
/*  Helper                                                             */
/* ------------------------------------------------------------------ */

function displayLabel(
  options: PickerOption[],
  value: string | null,
  fallback: string,
): string {
  if (!value) return fallback;
  return options.find((o) => o.value === value)?.label ?? value;
}

function normalizeHost(value: string | null | undefined): string {
  if (!value) return "";
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return "";
  const withProtocol = trimmed.includes("://") ? trimmed : `https://${trimmed}`;
  try {
    return new URL(withProtocol).hostname.toLowerCase();
  } catch {
    return trimmed.replace(/^https?:\/\//, "").split("/")[0]?.split(":")[0] ?? "";
  }
}

function buildMarketOptions(): MarketOption[] {
  const fromEnv = MARKET_HOST_OPTIONS.split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [rawHost, rawLabel] = entry.includes("|") ? entry.split("|", 2) : [entry, entry];
      const host = normalizeHost(rawHost);
      const label = (rawLabel || rawHost || "").trim();
      return host ? { host, label } : null;
    })
    .filter(Boolean) as MarketOption[];

  if (fromEnv.length > 0) return fromEnv;

  const defaults: MarketOption[] = [];
  const global = normalizeHost(GLOBAL_ENTRY_HOST);
  const fallback = normalizeHost(DEFAULT_MARKET_HOST);
  if (global) defaults.push({ host: global, label: `${global} (Global entry)` });
  if (fallback && fallback !== global) defaults.push({ host: fallback, label: `${fallback} (Default market)` });
  if (defaults.length === 0) defaults.push({ host: "beautonomi.co.za", label: "beautonomi.co.za (SA)" });
  return defaults;
}

/* ------------------------------------------------------------------ */
/*  Screen                                                             */
/* ------------------------------------------------------------------ */

function AppearanceSection() {
  const { themeMode, setThemeMode } = useTheme();
  const modes = [
    { key: "light" as const, label: "Light", icon: "sunny-outline" as const },
    { key: "dark" as const, label: "Dark", icon: "moon-outline" as const },
    { key: "system" as const, label: "System", icon: "phone-portrait-outline" as const },
  ];

  return (
    <View>
      <Text style={{ fontSize: 18, fontWeight: "700", color: Colors.gray[900], marginBottom: 4 }}>Appearance</Text>
      <Text style={{ fontSize: 14, color: Colors.gray[500], marginBottom: 12 }}>Choose your preferred theme</Text>
      <View>
        {modes.map((m, index) => (
          <TouchableOpacity
            key={m.key}
            onPress={() => setThemeMode(m.key)}
            style={{ backgroundColor: Colors.white, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: Colors.gray[100], flexDirection: "row", alignItems: "center", marginTop: index === 0 ? 0 : 8 }}
            activeOpacity={0.7}
            accessibilityRole="radio"
            accessibilityState={{ selected: themeMode === m.key }}
          >
            <Ionicons name={m.icon} size={20} color={themeMode === m.key ? Colors.primary : Colors.gray[400]} />
            <Text style={{ marginLeft: 12, flex: 1, fontWeight: "500", color: Colors.gray[900] }}>{m.label}</Text>
            {themeMode === m.key && (
              <Ionicons name="checkmark-circle" size={22} color={Colors.primary} />
            )}
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

export default function PreferencesScreen() {
  const { bundle } = useConfigBundle();

  const [languageOptions, setLanguageOptions] = useState<PickerOption[]>(LANGUAGE_OPTIONS);
  const [currencyOptions, setCurrencyOptions] = useState<PickerOption[]>(FALLBACK_CURRENCY_OPTIONS);
  const [timezoneOptions, setTimezoneOptions] = useState<PickerOption[]>(TIMEZONE_OPTIONS);

  const fieldConfig = useMemo(() => {
    const tenantCur =
      bundle?.meta?.tenant_region?.default_currency ?? getTenantDefaultCurrency();
    const defaultTz =
      bundle?.meta?.tenant_region?.timezone?.trim() || "Africa/Johannesburg";
    return [
      {
        field: "preferred_language" as const,
        label: "Language",
        options: languageOptions,
        defaultValue: "en",
        modalTitle: "Select language",
      },
      {
        field: "preferred_currency" as const,
        label: "Currency",
        options: currencyOptions,
        defaultValue: tenantCur,
        modalTitle: "Select currency",
      },
      {
        field: "timezone" as const,
        label: "Timezone",
        options: timezoneOptions,
        defaultValue: defaultTz,
        modalTitle: "Select timezone",
      },
    ];
  }, [
    bundle?.meta?.tenant_region?.default_currency,
    bundle?.meta?.tenant_region?.timezone,
    languageOptions,
    currencyOptions,
    timezoneOptions,
  ]);

  const [profile, setProfile] = useState<UserProfile>({
    preferred_language: null,
    preferred_currency: null,
    timezone: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [currentMarketHost, setCurrentMarketHost] = useState<string>(
    normalizeHost(getRuntimeMarketHost()),
  );

  const [pickerField, setPickerField] = useState<PreferenceField | null>(null);
  const pickerConfig = fieldConfig.find((c) => c.field === pickerField) ?? null;
  const marketOptions = buildMarketOptions();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [langsRes, curRes, tzRes, profileRes] = await Promise.all([
        api.get<PreferenceOptionRow[]>("/api/public/preference-options?type=language"),
        api.get<PreferenceOptionRow[]>("/api/public/preference-options?type=currency"),
        api.get<PreferenceOptionRow[]>("/api/public/preference-options?type=timezone"),
        api.get<UserProfile>("/api/me/profile"),
      ]);

      const langs = preferApiOrFallback(mapPreferenceRowsToPicker(langsRes.data), LANGUAGE_OPTIONS);
      setLanguageOptions(langs);

      const curFromApi = mapPreferenceRowsToPicker(curRes.data);
      setCurrencyOptions(
        preferApiOrFallback(
          curFromApi.map((o) => ({
            value: o.value,
            label: o.label || currencySelectLabel(o.value),
          })),
          FALLBACK_CURRENCY_OPTIONS,
        ),
      );

      setTimezoneOptions(preferApiOrFallback(mapPreferenceRowsToPicker(tzRes.data), TIMEZONE_OPTIONS));

      if (profileRes.error) {
        setError(profileRes.error.message || "Failed to load preferences");
        return;
      }
      if (profileRes.data) {
        setProfile({
          preferred_language: profileRes.data.preferred_language ?? null,
          preferred_currency: profileRes.data.preferred_currency ?? null,
          timezone: profileRes.data.timezone ?? null,
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load preferences");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    // Keep local state in sync with any deep-link based runtime switch.
    setCurrentMarketHost(normalizeHost(getRuntimeMarketHost()));
  }, []);

  const selectOption = useCallback(
    async (field: PreferenceField, value: string) => {
      const previous = { ...profile };
      const next = { ...profile, [field]: value };
      setProfile(next);
      setPickerField(null);
      setSaving(true);

      try {
        const res = await api.patch<UserProfile>("/api/me/profile", {
          [field]: value,
        });
        if (res.error) {
          setProfile(previous);
          Alert.alert("Error", res.error.message || "Failed to save preference");
        }
      } catch {
        setProfile(previous);
        Alert.alert("Error", "Failed to save preference. Please try again.");
      } finally {
        setSaving(false);
      }
    },
    [profile],
  );

  const selectMarketHost = useCallback(async (host: string) => {
    const normalized = normalizeHost(host);
    if (!normalized || normalized === currentMarketHost) return;
    await setRuntimeMarketHost(normalized);
    setCurrentMarketHost(normalized);
    Alert.alert("Market updated", `Your active market is now ${normalized}.`);
  }, [currentMarketHost]);

  return (
    <>
      <ScreenFrame loading={loading} error={error} onRetry={load}>
        <View>
          <View>
            <Text style={{ fontSize: 18, fontWeight: "700", color: Colors.gray[900] }}>App Preferences</Text>
            <Text style={{ fontSize: 14, color: Colors.gray[500], marginTop: 4 }}>
              Customise your language, currency, and timezone
            </Text>
          </View>

          <View style={{ marginTop: 24 }}>
            {fieldConfig.map((config, index) => (
              <TouchableOpacity
                key={config.field}
                onPress={() => setPickerField(config.field)}
                disabled={saving}
                style={{ backgroundColor: Colors.white, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: Colors.gray[100], marginTop: index === 0 ? 0 : 12 }}
                activeOpacity={0.7}
              >
                <Text style={{ fontSize: 14, color: Colors.gray[500], marginBottom: 4 }}>{config.label}</Text>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={{ fontWeight: "500", color: Colors.gray[900] }}>
                    {displayLabel(
                      config.options,
                      profile[config.field],
                      config.options.find((o) => o.value === config.defaultValue)?.label ??
                        config.defaultValue,
                    )}
                  </Text>
                  <Text style={{ color: Colors.gray[400], fontSize: 18 }}>›</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>

          {saving && (
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 8, marginTop: 24 }}>
              <ActivityIndicator size="small" color={Colors.primary} />
              <Text style={{ fontSize: 14, color: Colors.gray[500], marginLeft: 8 }}>Saving...</Text>
            </View>
          )}

          <View style={{ marginTop: 24 }}>
            <AppearanceSection />
          </View>

          <View style={{ marginTop: 24 }}>
            <Text style={{ fontSize: 18, fontWeight: "700", color: Colors.gray[900], marginBottom: 4 }}>
              Market
            </Text>
            <Text style={{ fontSize: 14, color: Colors.gray[500], marginBottom: 12 }}>
              Choose which market host the app uses for tenant routing
            </Text>
            {marketOptions.map((option, index) => {
              const selected = currentMarketHost === option.host;
              return (
                <TouchableOpacity
                  key={option.host}
                  onPress={() => selectMarketHost(option.host)}
                  style={{
                    backgroundColor: Colors.white,
                    borderRadius: 12,
                    padding: 16,
                    borderWidth: 1,
                    borderColor: selected ? Colors.primary : Colors.gray[100],
                    marginTop: index === 0 ? 0 : 8,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                  activeOpacity={0.7}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: "500", color: Colors.gray[900] }}>{option.label}</Text>
                    <Text style={{ marginTop: 2, fontSize: 12, color: Colors.gray[500] }}>{option.host}</Text>
                  </View>
                  {selected ? <Ionicons name="checkmark-circle" size={22} color={Colors.primary} /> : null}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </ScreenFrame>

      <Modal
        visible={pickerField !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setPickerField(null)}
      >
        <Pressable style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" }} onPress={() => setPickerField(null)}>
          <Pressable style={{ backgroundColor: Colors.white, borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: "60%" }} onPress={(e) => e.stopPropagation()}>
            <View style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.gray[200] }}>
              <Text style={{ textAlign: "center", fontWeight: "600", color: Colors.gray[900] }}>
                {pickerConfig?.modalTitle ?? "Select"}
              </Text>
            </View>
            <ScrollView style={{ padding: 16 }} keyboardShouldPersistTaps="handled">
              {pickerConfig?.options.map((option) => {
                const isSelected = pickerField !== null && profile[pickerField] === option.value;
                return (
                  <TouchableOpacity
                    key={option.value}
                    style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.gray[100] }}
                    onPress={() => {
                      if (pickerField) selectOption(pickerField, option.value);
                    }}
                  >
                    <Text style={{ fontSize: 16, fontWeight: isSelected ? "600" : "400", color: isSelected ? Colors.primary : Colors.gray[900] }}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
