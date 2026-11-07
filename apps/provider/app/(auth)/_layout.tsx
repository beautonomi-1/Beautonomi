import { Redirect, Stack, useGlobalSearchParams, useSegments } from "expo-router";
import { useAuth } from "@/providers/AuthProvider";
import { GateLoadingScreen } from "@/components/GateLoadingScreen";
import { LegalAcceptanceGate } from "@/components/legal/LegalAcceptanceGate";

function signedInHref(joinToken: string | string[] | undefined): "/" | `/join?token=${string}` {
  const raw = Array.isArray(joinToken) ? joinToken[0] : joinToken;
  const token = raw?.trim() ?? "";
  return token ? `/join?token=${encodeURIComponent(token)}` : "/";
}

export default function AuthLayout() {
  const { session, loading } = useAuth();
  const segments = useSegments();
  const { joinToken } = useGlobalSearchParams<{ joinToken?: string | string[] }>();
  // Signed-in users reach forgot-password from Settings; that screen handles its own exit.
  // Outside "(auth)" this layout is unmounting (e.g. forgot-password → home after a reset); don't redirect over it.
  const redirectSignedIn =
    segments[0] === "(auth)" && segments[segments.length - 1] !== "forgot-password";

  if (loading) {
    return <GateLoadingScreen />;
  }

  if (session && redirectSignedIn) {
    // This is the only post-login navigation. Login and signup must not also
    // call router.replace — a second replace during this transition throws
    // TypeError: undefined is not a function.
    return <Redirect href={signedInHref(joinToken)} />;
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
