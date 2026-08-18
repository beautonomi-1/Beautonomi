import { Stack } from "expo-router";
import { useTranslation } from "@beautonomi/i18n";
import { Colors } from "@/constants/colors";

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
        }}
      />
      <Stack.Screen name="age-assurance" options={{ headerShown: false }} />
      <Stack.Screen name="report-user" options={{ headerShown: false }} />
    </Stack>
  );
}
