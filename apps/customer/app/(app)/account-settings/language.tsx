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
import { changeLanguage } from "@/lib/i18n";
import { useScreenTracking } from "@/hooks/useScreenTracking";

/** Sync to account when the code is a bundled @beautonomi/i18n locale (matches /api/me/preferences). */
const API_LANGUAGE_CODES = new Set<string>(i18nSupportedLanguages.map((l) => l.code));

interface PreferencesResponse {
  preferences: { language: string; currency?: string; timezone?: string };
}

export default function LanguageSettings() {
  useScreenTracking("Language shortcut");
  useTranslation();
  const router = useRouter();
  const [currentCode, setCurrentCode] = useState(() => (i18n.language || "en").split("-")[0]);
  const { data: preferences, refresh } = useApi<PreferencesResponse>("/api/me/preferences");

  const serverLang = preferences?.preferences?.language ?? null;
  useEffect(() => {
    if (
      serverLang &&
      API_LANGUAGE_CODES.has(serverLang) &&
      serverLang !== (i18n.language || "en").split("-")[0]
    ) {
      void changeLanguage(serverLang as SupportedLanguage);
      setCurrentCode(serverLang);
    }
  }, [serverLang]);

  useEffect(() => {
    const handler = (lng: string) => setCurrentCode((lng || "en").split("-")[0]);
    i18n.on("languageChanged", handler);
    return () => {
      i18n.off("languageChanged", handler);
    };
  }, []);

  const handleSelect = useCallback(
    async (code: SupportedLanguage) => {
      if (code === currentCode) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await changeLanguage(code);
      setCurrentCode(code);
      if (API_LANGUAGE_CODES.has(code)) {
        const res = await api.post("/api/me/preferences", { language: code });
        if (res.error) {
          Alert.alert("Note", "Language changed locally but could not sync to your account.");
        }
        refresh();
      }
    },
    [currentCode, refresh],
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
          <Text style={{ fontWeight: "600" }}>Language & region</Text> under Account is the main place to set language,
          currency, and timezone. This screen is only the language list (for shortcuts); it writes the same{" "}
          <Text style={{ fontWeight: "600" }}>preferred_language</Text> field via <Text style={{ fontWeight: "600" }}>/api/me/preferences</Text>.
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
          accessibilityLabel="Open Language and region settings"
        >
          <Ionicons name="globe-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
          <Text style={{ color: "#fff", fontWeight: "600", fontSize: 14 }}>Open Language & region</Text>
        </TouchableOpacity>
      </View>

      <Text style={{ fontSize: 14, color: Colors.gray[500], marginBottom: 16 }}>
        Choose your preferred language. The app interface updates immediately.
      </Text>

      <View>
        {i18nSupportedLanguages.map((lang, index) => {
          const isActive = currentCode === lang.code;
          return (
            <TouchableOpacity
              key={lang.code}
              onPress={() => handleSelect(lang.code)}
              style={{
                borderRadius: 16,
                borderWidth: 1,
                borderColor: isActive ? "#F9A8D4" : Colors.gray[100],
                backgroundColor: isActive ? "#FDF2F8" : Colors.white,
                padding: 16,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                marginTop: index === 0 ? 0 : 8,
              }}
              accessibilityLabel={`Select ${lang.name}`}
              accessibilityRole="button"
            >
              <View>
                <Text style={{ fontSize: 16, fontWeight: "600", color: isActive ? "#BE185D" : Colors.gray[900] }}>
                  {lang.nativeName}
                </Text>
                <Text style={{ fontSize: 14, color: Colors.gray[500] }}>{lang.name}</Text>
              </View>
              {isActive && <Ionicons name="checkmark-circle" size={24} color={Colors.primary} />}
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={{ fontSize: 12, color: Colors.gray[400], textAlign: "center", marginTop: 24 }}>
        Some content from service providers may remain in its original language.
      </Text>
    </ScrollView>
  );
}
