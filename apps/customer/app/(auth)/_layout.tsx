import { Redirect, Stack, useLocalSearchParams } from "expo-router";
import { useAuth } from "@/providers/AuthProvider";
import { GateLoadingScreen } from "@/components/GateLoadingScreen";
import { LegalAcceptanceGate } from "@/components/legal/LegalAcceptanceGate";
import { resolvePostLoginHref } from "@/lib/post-login-href";

export default function AuthLayout() {
  const { session, loading } = useAuth();
  const { return_to: returnTo } = useLocalSearchParams<{ return_to?: string }>();

  if (loading) {
    return <GateLoadingScreen />;
  }

  if (session) {
    const href = resolvePostLoginHref(typeof returnTo === "string" ? returnTo : undefined);
    return <Redirect href={href as never} />;
  }

  return (
    <LegalAcceptanceGate>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="login" />
        <Stack.Screen name="signup" />
        <Stack.Screen name="forgot-password" />
        <Stack.Screen name="safety-and-age" />
      </Stack>
    </LegalAcceptanceGate>
  );
}
