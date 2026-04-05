import { Stack } from "expo-router";

export default function OnboardingStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { flex: 1, backgroundColor: "#ffffff" },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="wizard" options={{ gestureEnabled: false }} />
    </Stack>
  );
}
