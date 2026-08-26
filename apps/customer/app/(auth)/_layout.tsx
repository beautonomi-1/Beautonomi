import { Redirect, Stack } from "expo-router";
import { useAuth } from "@/providers/AuthProvider";
import { GateLoadingScreen } from "@/components/GateLoadingScreen";
import { LegalAcceptanceGate } from "@/components/legal/LegalAcceptanceGate";

export default function AuthLayout() {
  const { session, loading } = useAuth();

  if (loading) {
    return <GateLoadingScreen />;
  }

  if (session) return <Redirect href="/" />;

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
