import { Stack, router } from "expo-router";
import { TouchableOpacity, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";

// Ensures that deep-linking directly into /new or /[id] always has the
// tickets list as the anchor beneath it, so a back button exists.
export const unstable_settings = { initialRouteName: "index" };

function BackButton() {
  return (
    <TouchableOpacity
      onPress={() => (router.canGoBack() ? router.back() : router.replace("/(app)/help" as never))}
      hitSlop={{ top: 12, bottom: 12, left: 8, right: 12 }}
      accessibilityLabel="Go back"
      accessibilityRole="button"
      style={{ marginLeft: Platform.OS === "ios" ? 8 : 4, padding: 4 }}
    >
      <Ionicons name="chevron-back" size={26} color={Colors.primary} />
    </TouchableOpacity>
  );
}

export default function SupportTicketsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerTintColor: Colors.primary,
        headerBackTitle: "",
        headerLeft: () => <BackButton />,
      }}
    >
      <Stack.Screen name="index" options={{ title: "Support tickets" }} />
      <Stack.Screen name="new" options={{ title: "New ticket", headerShown: false }} />
      <Stack.Screen name="[id]" options={{ title: "Ticket" }} />
    </Stack>
  );
}
