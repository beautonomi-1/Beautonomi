import { Redirect, Stack } from "expo-router";
import { useAuth } from "@/providers/AuthProvider";
import { GateLoadingScreen } from "@/components/GateLoadingScreen";

export default function AuthLayout() {
  const { session, loading } = useAuth();

  // §Customer-audit 2026-04 (loading-polish): use the shared branded gate
  // loader so the auth layout matches the other access gates — previously
  // this was a bare spinner on white, which made the first frame look like
  // a blank splash.
  if (loading) {
    return <GateLoadingScreen />;
  }

  // Already authenticated — root index.tsx will route to the correct screen
  // (onboarding, home, or profile completion) based on the user's state.
  if (session) return <Redirect href="/" />;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="signup" />
      <Stack.Screen name="forgot-password" />
    </Stack>
  );
}
