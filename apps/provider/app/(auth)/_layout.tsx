import { Redirect, Stack } from "expo-router";
import { useAuth } from "@/providers/AuthProvider";
import { GateLoadingScreen } from "@/components/GateLoadingScreen";

export default function AuthLayout() {
  const { session, loading } = useAuth();

  // §Provider-audit 2026-04 (loading-polish): use the shared branded gate
  // loader instead of a bare ActivityIndicator. This keeps the experience
  // consistent across auth/portal/profile-completion gates and removes the
  // "blank white splash + spinner" flash on hot-reload and cold-start.
  if (loading) {
    return <GateLoadingScreen />;
  }

  // Already authenticated — let the root index route the user to the right screen.
  if (session) return <Redirect href="/" />;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: "#ffffff" },
      }}
    >
      <Stack.Screen name="login" />
      <Stack.Screen name="signup" />
      <Stack.Screen name="forgot-password" />
      <Stack.Screen name="terms" options={{ title: "Terms" }} />
      <Stack.Screen name="privacy" options={{ title: "Privacy" }} />
    </Stack>
  );
}
