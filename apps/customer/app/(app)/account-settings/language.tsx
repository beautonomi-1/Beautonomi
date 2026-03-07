import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTranslation, supportedLanguages } from "@beautonomi/i18n";
import { Colors } from "@/constants/colors";
import { changeLanguage } from "@/lib/i18n";

export default function LanguageSettings() {
  const { i18n } = useTranslation();

  const handleSelect = async (code: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await changeLanguage(code);
  };

  return (
    <View style={{ flex: 1, backgroundColor: Colors.white, paddingHorizontal: 20, paddingTop: 16 }}>
      <Text style={{ fontSize: 14, color: Colors.gray[500], marginBottom: 16 }}>
        Choose your preferred language. The app interface will update immediately.
      </Text>

      <View>
        {supportedLanguages.map((lang, index) => {
          const isActive = i18n.language === lang.code;
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
