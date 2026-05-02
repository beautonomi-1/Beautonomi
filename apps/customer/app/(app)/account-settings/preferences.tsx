/**
 * **Language & region** — primary Account entry for language, currency, and timezone.
 *
 * Saves `preferred_language`, `preferred_currency`, and `timezone` on the user (via `/api/me/profile` PATCH
 * and the same DB columns as `POST /api/me/preferences`).
 *
 * **Currency display expectation:** Most shop/booking screens still use `getTenantDefaultCurrency()` from the
 * remote config bundle (tenant/market). The currency saved here is the user’s account preference and is used
 * where APIs or future UI opt in — see `useCustomerDisplayCurrency()` if a screen should format prices using
 * `preferred_currency` instead of only the bundle default.
 */
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
import { useThemedColors } from "@/hooks/useThemedColors";
import {
  DEFAULT_MARKET_HOST,
  GLOBAL_ENTRY_HOST,
  MARKET_HOST_OPTIONS,
  getRuntimeMarketHost,
  setRuntimeMarketHost,
} from "@/config/public-env";
import { useConfigBundle } from "@/providers/ConfigBundleProvider";
import { getTenantDefaultCurrency } from "@/lib/config-bundle";
import { changeLanguage } from "@/lib/i18n";
import { getApiErrorMessage } from "@/lib/api-error";
import { currencySelectLabel, LAST_RESORT_CURRENCY } from "@beautonomi/utils";
import {
  mergeLanguagePickerOptions,
  supportedLanguages,
  useTranslation,
} from "@beautonomi/i18n";

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

function buildI18nAlignedLanguageOptions(apiRows: PickerOption[]): PickerOption[] {
  const merged = mergeLanguagePickerOptions(
    apiRows.map((o) => ({
      code: (o.value.split(/[-_]/)[0] || o.value).toLowerCase(),
      name: o.label,
    })),
  );
  return merged.map((m) => ({ value: m.code, label: m.name }));
}

/**
 * §UI-audit 2026-05: previously this fallback list invented African currency
 * options (KES / NGN / GHS / EGP) regardless of the tenant's region — so users
 * on the South African market saw currencies they couldn't actually transact
 * in. The new fallback only lists widely-recognised global currencies; the
 * tenant default currency is added back in `buildCurrencyFallbackOptions`
 * once the config bundle has resolved.
 */
const GLOBAL_CURRENCY_FALLBACK: PickerOption[] = [
  { value: LAST_RESORT_CURRENCY, label: currencySelectLabel(LAST_RESORT_CURRENCY) },
  { value: "USD", label: currencySelectLabel("USD") },
  { value: "EUR", label: currencySelectLabel("EUR") },
  { value: "GBP", label: currencySelectLabel("GBP") },
];

function buildCurrencyFallbackOptions(tenantDefault: string | null | undefined): PickerOption[] {
  const out: PickerOption[] = [];
  const seen = new Set<string>();
  const td = tenantDefault?.trim().toUpperCase();
  if (td) {
    out.push({ value: td, label: currencySelectLabel(td) });
    seen.add(td);
  }
  for (const opt of GLOBAL_CURRENCY_FALLBACK) {
    if (seen.has(opt.value)) continue;
    seen.add(opt.value);
    out.push(opt);
  }
  return out;
}

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

/** Some proxies return `{ data: [...] }` inside an already-unwrapped body — normalise to an array. */
function coercePreferenceOptionRows(raw: unknown): PreferenceOptionRow[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as PreferenceOptionRow[];
  if (typeof raw === "object" && raw !== null && "data" in raw && Array.isArray((raw as { data: unknown }).data)) {
    return (raw as { data: PreferenceOptionRow[] }).data;
  }
  return [];
}

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
  const { themeMode, setThemeMode, isDark } = useTheme();
  const themed = useThemedColors();
  const { t } = useTranslation();
  const modes = [
    { key: "light" as const, label: t("customer.preferencesScreen.appearanceLight"), icon: "sunny-outline" as const },
    { key: "dark" as const, label: t("customer.preferencesScreen.appearanceDark"), icon: "moon-outline" as const },
    { key: "system" as const, label: t("customer.preferencesScreen.appearanceSystem"), icon: "phone-portrait-outline" as const },
  ];

  return (
    <View>
      <Text style={{ fontSize: 18, fontWeight: "700", color: themed.textPrimary, marginBottom: 4 }}>
        {t("customer.preferencesScreen.appearanceTitle")}
      </Text>
      <Text style={{ fontSize: 14, color: themed.textSecondary, marginBottom: 12 }}>
        {t("customer.preferencesScreen.appearanceSubtitle")}
      </Text>
      <View>
        {modes.map((m, index) => {
          const selected = themeMode === m.key;
          return (
            <TouchableOpacity
              key={m.key}
              onPress={() => setThemeMode(m.key)}
              style={{
                backgroundColor: selected ? themed.primarySoft : themed.surface,
                borderRadius: 12,
                padding: 16,
                borderWidth: 1,
                borderColor: selected ? Colors.primary : themed.border,
                flexDirection: "row",
                alignItems: "center",
                marginTop: index === 0 ? 0 : 8,
              }}
              activeOpacity={0.7}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
            >
              <Ionicons name={m.icon} size={20} color={selected ? Colors.primary : themed.textMuted} />
              <Text style={{ marginLeft: 12, flex: 1, fontWeight: "500", color: themed.textPrimary }}>{m.label}</Text>
              {selected && (
                <Ionicons name="checkmark-circle" size={22} color={Colors.primary} />
              )}
            </TouchableOpacity>
          );
        })}
      </View>
      <Text style={{ fontSize: 12, color: themed.textMuted, marginTop: 8 }}>
        {isDark
          ? t("customer.preferencesScreen.appearanceHintDark")
          : themeMode === "system"
            ? t("customer.preferencesScreen.appearanceHintSystem")
            : t("customer.preferencesScreen.appearanceHintLight")}
      </Text>
    </View>
  );
}

export default function PreferencesScreen() {
  const { bundle, refresh: refreshConfigBundle } = useConfigBundle();
  const { t } = useTranslation();

  const [languageOptions, setLanguageOptions] = useState<PickerOption[]>(() =>
    supportedLanguages.map(({ code, nativeName, name }) => ({
      value: code,
      label: `${nativeName} (${name})`,
    })),
  );
  const [currencyOptions, setCurrencyOptions] = useState<PickerOption[]>(() =>
    buildCurrencyFallbackOptions(getTenantDefaultCurrency()),
  );
  const [timezoneOptions, setTimezoneOptions] = useState<PickerOption[]>(TIMEZONE_OPTIONS);

  const fieldConfig = useMemo(() => {
    const tenantCur =
      bundle?.meta?.tenant_region?.default_currency ?? getTenantDefaultCurrency();
    const defaultTz =
      bundle?.meta?.tenant_region?.timezone?.trim() || "Africa/Johannesburg";
    return [
      {
        field: "preferred_language" as const,
        label: t("customer.preferencesScreen.languageLabel"),
        options: languageOptions,
        defaultValue: "en",
        modalTitle: t("customer.preferencesScreen.languageModal"),
      },
      {
        field: "preferred_currency" as const,
        label: t("customer.preferencesScreen.currencyLabel"),
        options: currencyOptions,
        defaultValue: tenantCur,
        modalTitle: t("customer.preferencesScreen.currencyModal"),
      },
      {
        field: "timezone" as const,
        label: t("customer.preferencesScreen.timezoneLabel"),
        options: timezoneOptions,
        defaultValue: defaultTz,
        modalTitle: t("customer.preferencesScreen.timezoneModal"),
      },
    ];
  }, [
    bundle?.meta?.tenant_region?.default_currency,
    bundle?.meta?.tenant_region?.timezone,
    languageOptions,
    currencyOptions,
    timezoneOptions,
    t,
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

      const langsFromApi = mapPreferenceRowsToPicker(coercePreferenceOptionRows(langsRes.data));
      setLanguageOptions(buildI18nAlignedLanguageOptions(langsFromApi));

      const curFromApi = mapPreferenceRowsToPicker(coercePreferenceOptionRows(curRes.data));
      const tenantDefault =
        bundle?.meta?.tenant_region?.default_currency ?? getTenantDefaultCurrency();
      setCurrencyOptions(
        preferApiOrFallback(
          curFromApi.map((o) => ({
            value: o.value,
            label: o.label || currencySelectLabel(o.value),
          })),
          buildCurrencyFallbackOptions(tenantDefault),
        ),
      );

      setTimezoneOptions(
        preferApiOrFallback(mapPreferenceRowsToPicker(coercePreferenceOptionRows(tzRes.data)), TIMEZONE_OPTIONS),
      );

      if (profileRes.error) {
        setError(getApiErrorMessage(profileRes.error, "Failed to load preferences"));
        return;
      }
      const rawProfile = profileRes.data as UserProfile | { data?: UserProfile } | null | undefined;
      const profilePayload =
        rawProfile && typeof rawProfile === "object" && "data" in rawProfile && rawProfile.data
          ? rawProfile.data
          : rawProfile;
      if (profilePayload && typeof profilePayload === "object" && "preferred_language" in profilePayload) {
        setProfile({
          preferred_language: profilePayload.preferred_language ?? null,
          preferred_currency: profilePayload.preferred_currency ?? null,
          timezone: profilePayload.timezone ?? null,
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load preferences");
    } finally {
      setLoading(false);
    }
  }, [bundle?.meta?.tenant_region?.default_currency]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    // Keep local state in sync with any deep-link based runtime switch.
    setCurrentMarketHost(normalizeHost(getRuntimeMarketHost()));
  }, []);

  // When profile loads with a saved language, align i18n (same DB field as /api/me/preferences).
  useEffect(() => {
    const raw = profile.preferred_language?.trim();
    if (!raw) return;
    const code = raw.split(/[-_]/)[0];
    void import("@beautonomi/i18n").then(({ i18n }) => {
      const cur = (i18n.language || "en").split(/[-_]/)[0];
      if (cur !== code) void changeLanguage(code);
    });
  }, [profile.preferred_language]);

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
          Alert.alert(
            t("common.error"),
            getApiErrorMessage(res.error, t("customer.preferencesScreen.savePrefError")),
          );
        } else if (field === "preferred_language") {
          const code = value.split(/[-_]/)[0];
          await changeLanguage(code);
        }
      } catch {
        setProfile(previous);
        Alert.alert(t("common.error"), t("customer.preferencesScreen.savePrefRetry"));
      } finally {
        setSaving(false);
      }
    },
    [profile, t],
  );

  const selectMarketHost = useCallback(async (host: string) => {
    const normalized = normalizeHost(host);
    if (!normalized || normalized === currentMarketHost) return;
    await setRuntimeMarketHost(normalized);
    setCurrentMarketHost(normalized);
    try {
      await refreshConfigBundle();
    } catch {
      // Non-fatal: tenant metadata may refresh on next app launch.
    }
    Alert.alert(
      t("customer.preferencesScreen.marketUpdatedTitle"),
      t("customer.preferencesScreen.marketUpdatedBody", { host: normalized }),
    );
  }, [currentMarketHost, refreshConfigBundle, t]);

  const themed = useThemedColors();

  return (
    <>
      <ScreenFrame loading={loading} error={error} onRetry={load}>
        <View>
          <View>
            <Text style={{ fontSize: 18, fontWeight: "700", color: themed.textPrimary }}>
              {t("customer.preferencesScreen.title")}
            </Text>
            <Text style={{ fontSize: 14, color: themed.textSecondary, marginTop: 4 }}>
              {t("customer.preferencesScreen.subtitle")}
            </Text>
          </View>

          <View style={{ marginTop: 24 }}>
            {fieldConfig.map((config, index) => (
              <TouchableOpacity
                key={config.field}
                onPress={() => setPickerField(config.field)}
                disabled={saving}
                style={{ backgroundColor: themed.surface, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: themed.border, marginTop: index === 0 ? 0 : 12 }}
                activeOpacity={0.7}
              >
                <Text style={{ fontSize: 14, color: themed.textSecondary, marginBottom: 4 }}>{config.label}</Text>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={{ fontWeight: "500", color: themed.textPrimary }}>
                    {displayLabel(
                      config.options,
                      profile[config.field],
                      config.options.find((o) => o.value === config.defaultValue)?.label ??
                        config.defaultValue,
                    )}
                  </Text>
                  <Text style={{ color: themed.textMuted, fontSize: 18 }}>›</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>

          {saving && (
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 8, marginTop: 24 }}>
              <ActivityIndicator size="small" color={Colors.primary} />
              <Text style={{ fontSize: 14, color: themed.textSecondary, marginLeft: 8 }}>
                {t("customer.preferencesScreen.saving")}
              </Text>
            </View>
          )}

          <View style={{ marginTop: 24 }}>
            <AppearanceSection />
          </View>

          <View style={{ marginTop: 24 }}>
            <Text style={{ fontSize: 18, fontWeight: "700", color: themed.textPrimary, marginBottom: 4 }}>
              {t("customer.preferencesScreen.marketTitle")}
            </Text>
            <Text style={{ fontSize: 14, color: themed.textSecondary, marginBottom: 12 }}>
              {t("customer.preferencesScreen.marketSubtitle")}
            </Text>
            {marketOptions.map((option, index) => {
              const selected = currentMarketHost === option.host;
              return (
                <TouchableOpacity
                  key={option.host}
                  onPress={() => selectMarketHost(option.host)}
                  style={{
                    backgroundColor: themed.surface,
                    borderRadius: 12,
                    padding: 16,
                    borderWidth: 1,
                    borderColor: selected ? Colors.primary : themed.border,
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
                    <Text style={{ fontWeight: "500", color: themed.textPrimary }}>{option.label}</Text>
                    <Text style={{ marginTop: 2, fontSize: 12, color: themed.textSecondary }}>{option.host}</Text>
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
          <Pressable style={{ backgroundColor: themed.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: "60%" }} onPress={(e) => e.stopPropagation()}>
            <View style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: themed.border }}>
              <Text style={{ textAlign: "center", fontWeight: "600", color: themed.textPrimary }}>
                {pickerConfig?.modalTitle ?? "Select"}
              </Text>
            </View>
            <ScrollView style={{ padding: 16 }} keyboardShouldPersistTaps="handled">
              {pickerConfig?.options.map((option) => {
                const stored = pickerField ? profile[pickerField] : null;
                const resolved =
                  stored ?? (pickerConfig ? String(pickerConfig.defaultValue ?? "") : "");
                const isSelected = resolved === option.value;
                return (
                  <TouchableOpacity
                    key={option.value}
                    style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: themed.border }}
                    onPress={() => {
                      if (pickerField) selectOption(pickerField, option.value);
                    }}
                  >
                    <Text style={{ fontSize: 16, fontWeight: isSelected ? "600" : "400", color: isSelected ? Colors.primary : themed.textPrimary }}>
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
