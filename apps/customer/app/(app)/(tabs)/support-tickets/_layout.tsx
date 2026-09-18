import { Stack, router } from "expo-router";
import { TouchableOpacity, Platform } from "react-native";
import { Colors } from "@/constants/colors";
import { DirectionalIcon } from "@/components/ui/DirectionalIcon";
import { useTranslation } from "@beautonomi/i18n";

// Ensures that deep-linking directly into /new or /[id] always has the
// tickets list as the anchor beneath it, so a back button exists.
export const unstable_settings = { initialRouteName: "index" };

function BackButton() {
  const { t } = useTranslation();
  return (
    <TouchableOpacity
      onPress={() => (router.canGoBack() ? router.back() : router.replace("/(app)/help" as never))}
      hitSlop={{ top: 12, bottom: 12, left: 8, right: 12 }}
      accessibilityLabel={t("common.back")}
      accessibilityRole="button"
      style={{ marginStart: Platform.OS === "ios" ? 8 : 4, padding: 4 }}
    >
      <DirectionalIcon name="chevron-back" size={26} color={Colors.primary} />
    </TouchableOpacity>
  );
}

export default function SupportTicketsLayout() {
  const { t } = useTranslation();
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerTintColor: Colors.primary,
        headerBackTitle: "",
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: t("customer.mobile.stackTitles.support"),
          headerLeft: () => <BackButton />,
        }}
      />
      <Stack.Screen name="new" options={{ title: t("customer.mobile.stackTitles.newTicket"), headerShown: true }} />
      <Stack.Screen
        name="[id]"
        options={{
          title: t("customer.mobile.stackTitles.ticket"),
          headerLeft: () => <BackButton />,
        }}
      />
    </Stack>
  );
}
