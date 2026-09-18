import { Stack, router } from "expo-router";
import { TouchableOpacity, Platform } from "react-native";
import { useTranslation } from "@beautonomi/i18n";
import { Colors } from "@/constants/colors";
import { DirectionalIcon } from "@/components/ui/DirectionalIcon";

function SafetyHubBackButton() {
  const { t } = useTranslation();
  return (
    <TouchableOpacity
      onPress={() =>
        router.canGoBack() ? router.back() : router.replace("/(app)/(tabs)/profile" as never)
      }
      hitSlop={{ top: 12, bottom: 12, left: 8, right: 12 }}
      accessibilityLabel={t("common.back")}
      accessibilityRole="button"
      style={{ marginStart: Platform.OS === "ios" ? 8 : 4, padding: 4 }}
    >
      <DirectionalIcon name="chevron-back" size={26} color={Colors.primary} />
    </TouchableOpacity>
  );
}

export default function SafetyLayout() {
  const { t } = useTranslation();

  return (
    <Stack
      screenOptions={{
        headerTintColor: Colors.primary,
        headerTitleStyle: { fontWeight: "600" },
        contentStyle: { backgroundColor: Colors.gray[50] },
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: t("customer.mobile.screens.safetyHub.title"),
          headerBackTitle: t("common.back"),
          headerShown: true,
          headerLeft: () => <SafetyHubBackButton />,
        }}
      />
      <Stack.Screen name="age-assurance" options={{ headerShown: false }} />
      <Stack.Screen name="report-user" options={{ headerShown: false }} />
    </Stack>
  );
}
