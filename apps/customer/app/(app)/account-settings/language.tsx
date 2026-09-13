/**
 * Legacy / shortcut route: language picker only (deep links, old bookmarks).
 * **Main entry:** Account → **Language & region** (`preferences.tsx`) for language + currency + timezone together.
 * Both flows sync language via `POST /api/me/preferences` { language } → `users.preferred_language` (same as preferences).
 */
import { useEffect, useState, useCallback } from "react";
import { View, Text, TouchableOpacity, Alert, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import {
  useTranslation,
  supportedLanguages as i18nSupportedLanguages,
  i18n,
  type SupportedLanguage,
} from "@beautonomi/i18n";
import { useApi } from "@/hooks/useApi";
import { api } from "@/lib/api-client";
import { Colors } from "@/constants/colors";
import { changeLanguage, promptReloadIfDirectionChanged } from "@/lib/i18n";
import { normalizeLanguageCode } from "@beautonomi/i18n";
import { useScreenTracking } from "@/hooks/useScreenTracking";

/** Sync to account when the code is a bundled @beautonomi/i18n locale (matches /api/me/preferences). */
const API_LANGUAGE_CODES = new Set<string>(i18nSupportedLanguages.map((l) => l.code));

interface PreferencesResponse {
  preferences: { language: string; currency?: string; timezone?: string };
}

export default function LanguageSettings() {
  useScreenTracking("Language shortcut");
  const { t } = useTranslation();
  const ls = useCallback(
    (key: string, opts?: Record<string, unknown>) =>
      t(`customer.mobile.screens.languageScreen.${key}`, opts) as string,
    [t],
  );
  const visibleLanguages = i18nSupportedLanguages;
  const router = useRouter();
  const [currentCode, setCurrentCode] = useState(() => normalizeLanguageCode(i18n.language || "en"));
  const { data: preferences, refresh } = useApi<PreferencesResponse>("/api/me/preferences");

  const serverLang = preferences?.preferences?.language ?? null;
  useEffect(() => {
    if (
      serverLang &&
      API_LANGUAGE_CODES.has(serverLang) &&
      normalizeLanguageCode(serverLang) !== normalizeLanguageCode(i18n.language || "en")
    ) {
      void changeLanguage(serverLang as SupportedLanguage);
      setCurrentCode(serverLang);
    }
  }, [serverLang]);

  useEffect(() => {
    const handler = (lng: string) => setCurrentCode(normalizeLanguageCode(lng || "en"));
    i18n.on("languageChanged", handler);
    return () => {
      i18n.off("languageChanged", handler);
    };
  }, []);

  const handleSelect = useCallback(
    async (code: SupportedLanguage) => {
      if (code === currentCode) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
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
        refresh();
      }
    },
    [currentCode, refresh, ls],
  );

  return (
    <ScrollView style={{ flex: 1, backgroundColor: Colors.white }} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 32 }}>
      <View
        style={{
          marginBottom: 16,
          padding: 14,
          borderRadius: 12,
          backgroundColor: Colors.gray[50],
          borderWidth: 1,
          borderColor: Colors.gray[100],
        }}
      >
        <Text style={{ fontSize: 13, color: Colors.gray[700], lineHeight: 20 }}>
          <Text style={{ fontWeight: "600" }}>{ls("introCardTitle")}</Text>
          {ls("introCardBodyPrefix")}
          <Text style={{ fontWeight: "600" }}>{ls("introCardBodyField")}</Text>
          {ls("introCardBodySuffix")}
          <Text style={{ fontWeight: "600" }}>{ls("introCardBodyApi")}</Text>
          {ls("introCardBodyEnd")}
        </Text>
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push("/(app)/account-settings/preferences" as never);
          }}
          style={{
            marginTop: 12,
            flexDirection: "row",
            alignItems: "center",
            alignSelf: "flex-start",
            paddingVertical: 8,
            paddingHorizontal: 12,
            borderRadius: 10,
            backgroundColor: Colors.primary,
          }}
          accessibilityRole="button"
          accessibilityLabel={ls("openPreferencesA11y")}
        >
          <Ionicons name="globe-outline" size={18} color="#fff" style={{ marginEnd: 8 }} />
          <Text style={{ color: "#fff", fontWeight: "600", fontSize: 14 }}>{ls("openPreferencesCta")}</Text>
        </TouchableOpacity>
      </View>

      <Text style={{ fontSize: 14, color: Colors.gray[500], marginBottom: 16 }}>
        {ls("chooseLanguageSubtitle")}
      </Text>

      <View style={{ flexDirection: "row", flexWrap: "wrap", marginHorizontal: -6 }}>
        {visibleLanguages.map((lang) => {
          const isActive = currentCode === lang.code;
          return (
            <TouchableOpacity
              key={lang.code}
              onPress={() => handleSelect(lang.code)}
              style={{
                width: "50%",
                paddingHorizontal: 6,
                marginBottom: 12,
              }}
              accessibilityLabel={ls("selectLanguageA11y", { name: lang.name })}
              accessibilityRole="button"
            >
              <View
                style={{
                  borderRadius: 16,
                  borderWidth: 2,
                  borderColor: isActive ? "#222222" : "transparent",
                  backgroundColor: isActive ? Colors.white : Colors.gray[50],
                  paddingVertical: 14,
                  paddingHorizontal: 14,
                  minHeight: 72,
                  justifyContent: "center",
                }}
              >
                <Text style={{ fontSize: 16, fontWeight: "600", color: Colors.gray[900] }}>
                  {lang.nativeName}
                </Text>
                <Text style={{ fontSize: 14, color: Colors.gray[500], marginTop: 2 }}>{lang.name}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={{ fontSize: 12, color: Colors.gray[400], textAlign: "center", marginTop: 24 }}>
        {ls("providerContentNote")}
      </Text>
    </ScrollView>
  );
}
