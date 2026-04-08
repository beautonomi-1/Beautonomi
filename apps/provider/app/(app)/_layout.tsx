/**
 * App layout – all (app)/* routes are protected.
 * - Session: no session → redirect to /(auth)/login. Loading → show "Checking authentication…".
 * - RoleGate: ensures user has provider_owner or provider_staff (blocks and offers sign out otherwise).
 * - AccountStatusGuard: signs out and redirects if account is suspended or deactivated.
 * - Every API call from useApi / api uses Bearer token from Supabase; 401 triggers refresh then retry, then sign out so this layout redirects.
 */
import { Fragment, useEffect, useMemo, useRef } from "react";
import { View, Text, ActivityIndicator, Linking, Platform } from "react-native";
import { Redirect, Stack, useRouter } from "expo-router";
import { useAuth } from "@/providers/AuthProvider";
import { Colors } from "@/constants/colors";
import { RoleGate } from "@/components/RoleGate";
import { ProviderProvider } from "@/providers/ProviderContext";
import { NotificationsCountProvider } from "@/providers/NotificationsCountContext";
import { OnDemandIncomingListener } from "@/components/OnDemandIncomingListener";
import { SingularLinkHandler } from "@/components/SingularLinkHandler";
import { EmailVerificationBanner } from "@/components/EmailVerificationBanner";
import { ProfileLoadErrorBanner } from "@/components/ProfileLoadErrorBanner";
import { AccountStatusGuard } from "@/components/AccountStatusGuard";
import MaintenanceGate from "@/components/MaintenanceGate";
import { NativePermissionsOnboarding } from "@/components/NativePermissionsOnboarding";
import {
  authFlowBreadcrumb,
  isSentryEnabled,
  setAuthFlowTags,
} from "@/lib/sentry";

const SUBSCRIPTION_SUCCESS_DEEP_LINK = "provider://subscription/success";

export default function AppLayout() {
  const { session, loading } = useAuth();
  const router = useRouter();
  const sentryAppReadyLogged = useRef<string | null>(null);
  const stackScreenOptions = useMemo(
    () => ({
      headerShown: false,
      contentStyle: { flex: 1, backgroundColor: "#ffffff" },
    }),
    [],
  );

  // Deep link: open native subscription screen (e.g. after payment in browser, if user taps Return to app)
  useEffect(() => {
    if (Platform.OS === "web") return;
    const handleUrl = (url: string) => {
      if (url === SUBSCRIPTION_SUCCESS_DEEP_LINK || url.startsWith(SUBSCRIPTION_SUCCESS_DEEP_LINK + "?")) {
        router.replace("/(app)/(tabs)/more/settings/subscription" as never);
      }
    };
    Linking.getInitialURL().then((url) => {
      if (url) handleUrl(url);
    });
    const sub = Linking.addEventListener("url", ({ url }) => handleUrl(url));
    return () => sub.remove();
  }, [router]);

  useEffect(() => {
    if (!__DEV__) return;
    console.log("(app)/_layout auth gate", { authLoading: loading, hasSession: !!session });
  }, [loading, session?.user?.id]);

  useEffect(() => {
    if (!session?.user?.id) {
      sentryAppReadyLogged.current = null;
      return;
    }
    if (!isSentryEnabled() || loading) return;
    const uid = session.user.id;
    if (sentryAppReadyLogged.current === uid) return;
    sentryAppReadyLogged.current = uid;
    setAuthFlowTags({ route_group: "(app)" });
    authFlowBreadcrumb("authenticated_app_layout", { phase: "session_ready" });
  }, [loading, session?.user?.id]);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: Colors.white }}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={{ marginTop: 12, fontSize: 16, color: Colors.gray[600] }}>Checking authentication…</Text>
      </View>
    );
  }
  if (!session) return <Redirect href="/(auth)/login" />;

  return (
    <MaintenanceGate>
    <AccountStatusGuard>
      <ProviderProvider>
      <RoleGate>
        <NotificationsCountProvider>
        <Fragment>
        <NativePermissionsOnboarding />
        <OnDemandIncomingListener />
        <SingularLinkHandler />
        <View style={{ flex: 1 }}>
          <EmailVerificationBanner />
          <ProfileLoadErrorBanner />
          <Stack
          screenOptions={stackScreenOptions}
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
      </RoleGate>
      </ProviderProvider>
    </AccountStatusGuard>
    </MaintenanceGate>
  );
}
