import { useEffect, useState, useCallback } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTranslation, supportedLanguages, i18n } from "@beautonomi/i18n";
import { useApi } from "@/hooks/useApi";
import { api } from "@/lib/api-client";
import { Colors } from "@/constants/colors";
import { changeLanguage } from "@/lib/i18n";

const API_LANGUAGE_CODES = new Set(["en", "af", "zu", "xh", "nso", "tn", "ts", "ve", "ss"]);

interface PreferencesResponse {
  preferences: { language: string; currency?: string; timezone?: string };
}

export default function LanguageSettings() {
  useTranslation();
  const [currentCode, setCurrentCode] = useState(() => (i18n.language || "en").split("-")[0]);
  const { data: preferences, refresh } = useApi<PreferencesResponse>("/api/me/preferences");

  useEffect(() => {
    const serverLang = preferences?.preferences?.language;
    if (serverLang && supportedLanguages.some((l) => l.code === serverLang) && serverLang !== (i18n.language || "en").split("-")[0]) {
      changeLanguage(serverLang);
      setCurrentCode(serverLang);
    }
  }, [preferences?.preferences?.language]);

  useEffect(() => {
    const handler = (lng: string) => setCurrentCode((lng || "en").split("-")[0]);
    i18n.on("languageChanged", handler);
    return () => {
      i18n.off("languageChanged", handler);
    };
  }, []);

  const handleSelect = useCallback(async (code: string) => {
    if (code === currentCode) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await changeLanguage(code);
    setCurrentCode(code);
    if (API_LANGUAGE_CODES.has(code)) {
      await api.post("/api/me/preferences", { language: code });
      refresh();
    }
  }, [currentCode, refresh]);

  return (
    <View style={{ flex: 1, backgroundColor: Colors.white, paddingHorizontal: 20, paddingTop: 16 }}>
      <Text style={{ fontSize: 14, color: Colors.gray[500], marginBottom: 16 }}>
        Choose your preferred language. The app interface will update immediately.
      </Text>

      <View>
        {supportedLanguages.map((lang, index) => {
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
              {isActive && (
                <Ionicons name="checkmark-circle" size={24} color={Colors.primary} />
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={{ fontSize: 12, color: Colors.gray[400], textAlign: "center", marginTop: 24 }}>
        Some content from service providers may remain in its original language.
      </Text>
    </View>
  );
}
