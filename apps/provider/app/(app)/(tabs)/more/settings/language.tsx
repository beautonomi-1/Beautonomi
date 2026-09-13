/**
 * App language – choose from supported languages. Persists to AsyncStorage via changeLanguage.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, Alert } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTranslation , i18n, supportedLanguages } from "@beautonomi/i18n";

import { changeLanguage, promptReloadIfDirectionChanged } from "@/lib/i18n";
import { normalizeLanguageCode } from "@beautonomi/i18n";
import { api } from "@/lib/api-client";
import { useApi } from "@/hooks/useApi";
import { useConfigBundle } from "@/providers/ConfigBundleProvider";
import { buildFormatLocale } from "@beautonomi/i18n";
import { setDefaultMoneyLocale } from "@beautonomi/utils";
import { getTenantRegionCode } from "@/lib/config-bundle";
import { useResponsive } from "@/hooks/useResponsive";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { twStyle } from "@/lib/twStyle";
import {
  DEFAULT_MARKET_HOST,
  GLOBAL_ENTRY_HOST,
  MARKET_HOST_OPTIONS,
  getRuntimeMarketHost,
  setRuntimeMarketHost,
} from "@/config/public-env";

type MarketOption = { host: string; label: string };

interface PreferencesResponse {
  preferences: { language: string; currency?: string; timezone?: string };
}

const API_LANGUAGE_CODES = new Set(supportedLanguages.map((l) => l.code));

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

export default function LanguageSettingsScreen() {
  const router = useRouter();
  const { screenPadding } = useResponsive();
  const { t } = useTranslation();
  const { bundle, refresh: refreshConfigBundle } = useConfigBundle();
  const ls = useCallback(
    (key: string, opts?: Record<string, unknown>) =>
      t(`provider.mobile.screens.languageSettings.${key}`, opts) as string,
    [t],
  );
  const visibleLanguages = useMemo(() => supportedLanguages, []);
  const [currentCode, setCurrentCode] = useState(i18n.language || "en");
  const [currentMarketHost, setCurrentMarketHost] = useState<string>(normalizeHost(getRuntimeMarketHost()));
  const marketOptions = buildMarketOptions();
  const { data: preferences, refresh: refreshPreferences } =
    useApi<PreferencesResponse>("/api/me/preferences");

  const serverLang = preferences?.preferences?.language ?? null;
  useEffect(() => {
    if (
      serverLang &&
      API_LANGUAGE_CODES.has(serverLang) &&
      normalizeLanguageCode(serverLang) !== normalizeLanguageCode(i18n.language || "en")
    ) {
      void changeLanguage(serverLang);
      setCurrentCode(serverLang);
    }
  }, [serverLang]);

  useEffect(() => {
    const handler = (lng: string) => setCurrentCode(lng);
    i18n.on("languageChanged", handler);
    return () => {
      i18n.off("languageChanged", handler);
    };
  }, []);

  const handleSelect = useCallback(
    async (code: string) => {
      if (code === currentCode) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const { directionChanged } = await changeLanguage(code);
      setCurrentCode(code);
      promptReloadIfDirectionChanged(directionChanged, Alert.alert, {
        title: ls("restartRequiredTitle"),
        body: ls("restartRequiredBody"),
        reload: ls("restartNow"),
      });
      if (API_LANGUAGE_CODES.has(code)) {
        const res = await api.post("/api/me/preferences", { language: code });
        if (res.error) {
          Alert.alert(ls("syncNoteTitle"), ls("syncNoteBody"));
        }
        refreshPreferences();
      }
    },
    [currentCode, refreshPreferences, ls]
  );

  const handleMarketSelect = useCallback(async (host: string) => {
    const normalized = normalizeHost(host);
    if (!normalized || normalized === currentMarketHost) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await setRuntimeMarketHost(normalized);
    setCurrentMarketHost(normalized);
    try {
      await refreshConfigBundle();
      setDefaultMoneyLocale(buildFormatLocale(i18n.language, getTenantRegionCode()));
    } catch {
      // Non-fatal: bundle refreshes on next launch.
    }
    Alert.alert(ls("marketUpdatedTitle"), ls("marketUpdatedBody", { host: normalized }));
  }, [currentMarketHost, refreshConfigBundle, ls]);

  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader
        title={t("common.appLanguage")}
        subtitle={t("common.appLanguageSubtitle")}
        onBack={() => router.back()}
      />
      <ScrollView
        style={twStyle("flex-1")}
        contentContainerStyle={{ paddingHorizontal: screenPadding, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {visibleLanguages.map(({ code, name, nativeName }) => {
          const isSelected = normalizeLanguageCode(currentCode) === code;
          return (
            <TouchableOpacity
              key={code}
              onPress={() => handleSelect(code)}
              style={twStyle("flex-row items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-4 mb-2")}
              accessibilityRole="radio"
              accessibilityState={{ checked: isSelected }}
              accessibilityLabel={`${name} (${nativeName})`}
            >
              <View>
                <Text style={twStyle("text-base font-medium text-gray-900")}>{name}</Text>
                {nativeName !== name && (
                  <Text style={twStyle("text-sm text-gray-500")}>{nativeName}</Text>
                )}
              </View>
              {isSelected && (
                <Ionicons name="checkmark-circle" size={24} color="#14b8a6" />
              )}
            </TouchableOpacity>
          );
        })}

        <View style={twStyle("mt-5 mb-2 px-1")}>
          <Text style={twStyle("text-xs uppercase tracking-wider text-gray-400")}>{ls("marketLabel")}</Text>
        </View>
        {marketOptions.map((option) => {
          const isSelected = currentMarketHost === option.host;
          return (
            <TouchableOpacity
              key={option.host}
              onPress={() => handleMarketSelect(option.host)}
              style={twStyle("flex-row items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-4 mb-2")}
              accessibilityRole="radio"
              accessibilityState={{ checked: isSelected }}
              accessibilityLabel={option.label}
            >
              <View style={twStyle("flex-1")}>
                <Text style={twStyle("text-base font-medium text-gray-900")}>{option.label}</Text>
                <Text style={twStyle("text-xs text-gray-500")}>{option.host}</Text>
              </View>
              {isSelected && (
                <Ionicons name="checkmark-circle" size={24} color="#14b8a6" />
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </ScreenContainer>
  );
}
