import { Redirect, Stack, useSegments } from "expo-router";
import { useAuth } from "@/providers/AuthProvider";
import { GateLoadingScreen } from "@/components/GateLoadingScreen";
import { LegalAcceptanceGate } from "@/components/legal/LegalAcceptanceGate";

export default function AuthLayout() {
  const { session, loading } = useAuth();
  const segments = useSegments();
  // Signed-in users reach forgot-password from Settings; that screen handles its own exit.
  // Outside "(auth)" this layout is unmounting (e.g. forgot-password → home after a reset); don't redirect over it.
  const redirectSignedIn =
    segments[0] === "(auth)" && segments[segments.length - 1] !== "forgot-password";

  if (loading) {
    return <GateLoadingScreen />;
  }

  if (session && redirectSignedIn) {
    return <Redirect href="/" />;
  }

  return (
    <LegalAcceptanceGate>
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
    </LegalAcceptanceGate>
  );
}
