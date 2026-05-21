/**
 * App layout – all (app)/* routes are protected.
 * - Session: no session → redirect to /(auth)/login. Loading → show "Checking authentication…".
 * - RoleGate: ensures user has provider_owner or provider_staff (blocks and offers sign out otherwise).
 * - AccountStatusGuard: signs out and redirects if account is suspended or deactivated.
 * - Every API call from useApi / api uses Bearer token from Supabase; 401 triggers refresh then retry once.
 *   Sign out only occurs if Supabase itself rejects the refresh (session truly expired/revoked),
 *   NOT on transient network failures or web API config issues (which would cause a login loop).
 */
import { Fragment, useEffect, useMemo, useRef } from "react";
import { View, Linking, Platform } from "react-native";
import { Redirect, Stack, useRouter } from "expo-router";
import { useAuth } from "@/providers/AuthProvider";
import { GateLoadingScreen } from "@/components/GateLoadingScreen";
import { RoleGate } from "@/components/RoleGate";
import { ProviderProvider } from "@/providers/ProviderContext";
import { NotificationsCountProvider } from "@/providers/NotificationsCountContext";
import { OnDemandIncomingListener } from "@/components/OnDemandIncomingListener";
import { BookingAlertListener } from "@/components/BookingAlertListener";
import { SingularLinkHandler } from "@/components/SingularLinkHandler";
import { EmailVerificationBanner } from "@/components/EmailVerificationBanner";
import { ProfileLoadErrorBanner } from "@/components/ProfileLoadErrorBanner";
import { AccountStatusGuard } from "@/components/AccountStatusGuard";
import MaintenanceGate from "@/components/MaintenanceGate";
import { BiometricGate } from "@/components/BiometricGate";
import { NativePermissionsOnboarding } from "@/components/NativePermissionsOnboarding";
import { SetupCompleteCelebration } from "@/components/setup/SetupCompleteCelebration";
import {
  authFlowBreadcrumb,
  isSentryEnabled,
  setAuthFlowTags,
} from "@/lib/sentry";

const SUBSCRIPTION_SUCCESS_DEEP_LINK = "provider://subscription/success";
const ADS_SETTINGS_DEEP_LINK = "provider://settings/ads";

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
      } else if (url === ADS_SETTINGS_DEEP_LINK || url.startsWith(ADS_SETTINGS_DEEP_LINK + "?")) {
        router.replace("/(app)/(tabs)/more/settings/ads" as never);
      }
    };
    Linking.getInitialURL().then((url) => {
      if (url) handleUrl(url);
    }).catch(() => {});
    const sub = Linking.addEventListener("url", ({ url }) => handleUrl(url));
    return () => sub.remove();
  }, [router]);

  useEffect(() => {
    if (!__DEV__) return;
    console.log("(app)/_layout auth gate", { authLoading: loading, hasSession: !!session });
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // §Provider-audit 2026-04 (loading-polish): reuse the branded gate so the
    // auth-check frame matches /index.tsx and the (auth) layout.
    return <GateLoadingScreen message="Checking authentication…" />;
  }
  if (!session) return <Redirect href="/(auth)/login" />;

  return (
    <MaintenanceGate>
    {/*
      §Provider-launch (audit 2026-04): BiometricGate enforces the
      "Require Face ID / fingerprint" toggle from Settings by actually
      blocking the authenticated shell until the OS unlock flow
      succeeds. See src/components/BiometricGate.tsx for details.
    */}
    <BiometricGate>
    <AccountStatusGuard>
      <ProviderProvider>
      <RoleGate>
        <NotificationsCountProvider>
        <Fragment>
        <NativePermissionsOnboarding />
        <OnDemandIncomingListener />
        <BookingAlertListener />
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
          <Stack.Screen name="announcements" options={{ headerShown: false }} />
          <Stack.Screen name="on-demand/incoming/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
        </Stack>
        </View>
        {/* §provider-setup-seamless-ux 2026-05: one-time celebration the
            moment /api/provider/setup-status flips isComplete. Self-gates on
            an AsyncStorage flag so it never fires twice. */}
        <SetupCompleteCelebration />
        </Fragment>
        </NotificationsCountProvider>
      </RoleGate>
      </ProviderProvider>
    </AccountStatusGuard>
    </BiometricGate>
    </MaintenanceGate>
  );
}
