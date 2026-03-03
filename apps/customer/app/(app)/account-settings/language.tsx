import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTranslation, supportedLanguages } from "@beautonomi/i18n";
import { changeLanguage } from "@/lib/i18n";

export default function LanguageSettings() {
  const { i18n } = useTranslation();

  const handleSelect = async (code: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await changeLanguage(code);
  };

  return (
    <View className="flex-1 bg-white px-5 pt-4">
      <Text className="text-sm text-gray-500 mb-4">
        Choose your preferred language. The app interface will update immediately.
      </Text>

      <View className="gap-2">
        {supportedLanguages.map((lang) => {
          const isActive = i18n.language === lang.code;
          return (
            <TouchableOpacity
              key={lang.code}
              onPress={() => handleSelect(lang.code)}
              className={`rounded-2xl border p-4 flex-row items-center justify-between ${
                isActive
                  ? "border-pink-300 bg-pink-50"
                  : "border-gray-100 bg-white"
              }`}
              accessibilityLabel={`Select ${lang.name}`}
              accessibilityRole="button"
            >
              <View>
                <Text
                  className={`text-base font-semibold ${
                    isActive ? "text-pink-700" : "text-gray-900"
                  }`}
                >
                  {lang.nativeName}
                </Text>
                <Text className="text-sm text-gray-500">{lang.name}</Text>
              </View>
              {isActive && (
                <Ionicons name="checkmark-circle" size={24} color="#FF0077" />
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      <Text className="text-xs text-gray-400 text-center mt-6">
        Some content from service providers may remain in its original language.
      </Text>
    </View>
  );
}
