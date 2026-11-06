import { Redirect, Stack, useLocalSearchParams, useSegments } from "expo-router";
import { useAuth } from "@/providers/AuthProvider";
import { GateLoadingScreen } from "@/components/GateLoadingScreen";
import { LegalAcceptanceGate } from "@/components/legal/LegalAcceptanceGate";
import { resolvePostLoginHref } from "@/lib/post-login-href";
export default function AuthLayout() {
  const { session, loading } = useAuth();
  const { return_to: returnTo } = useLocalSearchParams<{ return_to?: string }>();
  const segments = useSegments();
  // Signed-in users reach forgot-password from Login & security; that screen handles its own exit.
  // Outside "(auth)" this layout is unmounting (e.g. forgot-password → home after a reset); don't redirect over it.
  const redirectSignedIn =
    segments[0] === "(auth)" && segments[segments.length - 1] !== "forgot-password";

  if (loading) {
    return <GateLoadingScreen />;
  }

  if (session && redirectSignedIn) {
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
