import { Fragment } from "react";
import { View } from "react-native";
import { Redirect, Stack } from "expo-router";
import { useAuth } from "@/providers/AuthProvider";
import { RoleGate } from "@/components/RoleGate";
import { ProviderProvider } from "@/providers/ProviderContext";
import { NotificationsCountProvider } from "@/providers/NotificationsCountContext";
import { OnDemandIncomingListener } from "@/components/OnDemandIncomingListener";
import { SingularLinkHandler } from "@/components/SingularLinkHandler";
import { EmailVerificationBanner } from "@/components/EmailVerificationBanner";
import { AccountStatusGuard } from "@/components/AccountStatusGuard";

export default function AppLayout() {
  const { session, loading } = useAuth();

  if (loading) return null;
  if (!session) return <Redirect href="/(auth)/login" />;

  return (
    <AccountStatusGuard>
    <RoleGate>
      <ProviderProvider>
        <NotificationsCountProvider>
        <Fragment>
        <OnDemandIncomingListener />
        <SingularLinkHandler />
        <View style={{ flex: 1 }}>
          <EmailVerificationBanner />
          <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: "#ffffff" },
          }}
        >
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="chat/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="search" options={{ headerShown: false }} />
          <Stack.Screen name="notifications" options={{ headerShown: false }} />
          <Stack.Screen name="on-demand/incoming/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
        </Stack>
        </View>
        </Fragment>
        </NotificationsCountProvider>
      </ProviderProvider>
    </RoleGate>
    </AccountStatusGuard>
  );
}
