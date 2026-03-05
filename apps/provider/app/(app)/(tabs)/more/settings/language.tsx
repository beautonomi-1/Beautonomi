/**
 * App language – choose from supported languages. Persists to AsyncStorage via changeLanguage.
 */
import { useCallback, useEffect, useState } from "react";
import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTranslation , i18n, supportedLanguages } from "@beautonomi/i18n";

import { changeLanguage } from "@/lib/i18n";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";

export default function LanguageSettingsScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const [currentCode, setCurrentCode] = useState(i18n.language || "en");

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
      await changeLanguage(code);
      setCurrentCode(code);
    },
    [currentCode]
  );

  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader
        title={t("common.appLanguage")}
        subtitle={t("common.appLanguageSubtitle")}
        onBack={() => router.back()}
      />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {supportedLanguages.map(({ code, name, nativeName }) => {
          const isSelected = currentCode.split("-")[0] === code;
          return (
            <TouchableOpacity
              key={code}
              onPress={() => handleSelect(code)}
              className="flex-row items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-4 mb-2"
              accessibilityRole="radio"
              accessibilityState={{ checked: isSelected }}
              accessibilityLabel={`${name} (${nativeName})`}
            >
              <View>
                <Text className="text-base font-medium text-gray-900">{name}</Text>
                {nativeName !== name && (
                  <Text className="text-sm text-gray-500">{nativeName}</Text>
                )}
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
