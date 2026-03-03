import { Stack } from "expo-router";

/**
 * Layout for auth callback (OAuth redirect).
 * Used when provider app runs on web and OAuth redirects to /auth/callback.
 */
export default function AuthCallbackLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="callback" />
    </Stack>
  );
}
