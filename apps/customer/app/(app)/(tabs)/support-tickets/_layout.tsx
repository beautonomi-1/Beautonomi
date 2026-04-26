import { Stack } from "expo-router";
import { Colors } from "@/constants/colors";

export default function SupportTicketsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerTintColor: Colors.primary,
      }}
    >
      <Stack.Screen name="index" options={{ title: "Support tickets" }} />
      <Stack.Screen name="new" options={{ title: "New ticket" }} />
      <Stack.Screen name="[id]" options={{ title: "Ticket" }} />
    </Stack>
  );
}
