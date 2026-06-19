import "../global.css";
import "@/lib/i18n";
import { useEffect } from "react";
import { Platform, Text, TouchableOpacity, View } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { SafeAreaProvider, initialWindowMetrics } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "@/providers/AuthProvider";
import { AnalyticsProvider } from "@/providers/AnalyticsProvider";
import { ConfigBundleProvider } from "@/providers/ConfigBundleProvider";
import { NativePermissionsOnboardingProvider } from "@/providers/NativePermissionsOnboardingProvider";
import { PushNotificationsProvider } from "@/providers/PushNotificationsProvider";
import { InAppBannerProvider } from "@/providers/InAppBannerProvider";
import { ThemeProvider, useTheme } from "@/providers/ThemeProvider";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { OfflineBar } from "@/components/OfflineBar";
import { useForceUpdate } from "@/hooks/useForceUpdate";
import { initSentry, setMobileAppTag, Sentry } from "@/lib/sentry";
import { initConnectivityTracking } from "@/lib/connectivity";
import { initSingular } from "@/lib/singular";
import MarketAvailabilityGate from "@/components/MarketAvailabilityGate";
import {
  initializeRuntimeMarketHost,
  startRuntimeMarketHostLinkListener,
} from "@/config/public-env";
import { ScreenshotDeepLinkBootstrap } from "@/components/ScreenshotDeepLinkBootstrap";
import { configureNativePushNotifications } from "@/lib/push-notifications-setup";
import { ImageCropperProvider } from "@/components/image-crop";

// Initialize Sentry and Singular before anything renders; catch so a failure doesn't crash the app
try {
  initSentry();
  setMobileAppTag("provider");
} catch {}
try {
  initConnectivityTracking();
} catch {}
try {
  initSingular();
} catch {}
if (Platform.OS !== "web") {
  configureNativePushNotifications();
}

if (Platform.OS !== "web") {
  SplashScreen.preventAutoHideAsync();
}

/** Max time splash can stay visible (e.g. after install/update). Then hide so user sees login. */
const MAX_SPLASH_MS = 4000;

function SplashController() {
  const { loading } = useAuth();
  useEffect(() => {
    if (Platform.OS === "web") return;
    if (!loading) {
      SplashScreen.hideAsync();
      return;
    }
    const timeoutId = setTimeout(() => {
      SplashScreen.hideAsync();
    }, MAX_SPLASH_MS);
    return () => clearTimeout(timeoutId);
  }, [loading]);
  return null;
}

function ForceUpdateGate({ children }: { children: React.ReactNode }) {
  const { updateRequired, openUpdate } = useForceUpdate();
  if (updateRequired) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#fff", padding: 24 }}>
        <Text style={{ fontSize: 20, fontWeight: "700", color: "#111827", textAlign: "center" }}>
          Update required
        </Text>
        <Text style={{ marginTop: 10, fontSize: 15, lineHeight: 22, color: "#4B5563", textAlign: "center" }}>
          A newer version of Beautonomi Partner is required to keep bookings, payments, and provider tools working correctly.
        </Text>
        <TouchableOpacity
          onPress={openUpdate}
          accessibilityRole="button"
          accessibilityLabel="Update Beautonomi Partner now"
          style={{ marginTop: 24, minHeight: 48, borderRadius: 14, backgroundColor: "#111827", paddingHorizontal: 28, paddingVertical: 14 }}
        >
          <Text style={{ color: "#fff", fontWeight: "700" }}>Update now</Text>
        </TouchableOpacity>
      </View>
    );
  }
  return <>{children}</>;
}

function ThemedApp() {
  const { isDark } = useTheme();

  return (
    <>
      <SplashController />
      <OfflineBar />
      <ForceUpdateGate>
        <InAppBannerProvider>
        <PushNotificationsProvider>
          <ScreenshotDeepLinkBootstrap />
          <Stack
            screenOptions={{
              headerShown: false,
              freezeOnBlur: true,
              contentStyle: { flex: 1, backgroundColor: "#ffffff" },
            }}
          >
            <Stack.Screen name="index" />
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(app)" />
          </Stack>
        </PushNotificationsProvider>
        </InAppBannerProvider>
      </ForceUpdateGate>
      <StatusBar style={isDark ? "light" : "dark"} />
      <MarketAvailabilityGate />
    </>
  );
}

function RootLayout() {
  useEffect(() => {
    void initializeRuntimeMarketHost();
    const unsubscribe = startRuntimeMarketHostLinkListener();
    return unsubscribe;
  }, []);

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <ErrorBoundary>
        <ThemeProvider>
          <ImageCropperProvider>
          <AuthProvider>
            <NativePermissionsOnboardingProvider>
            <AnalyticsProvider>
              <ConfigBundleProvider>
                <ThemedApp />
              </ConfigBundleProvider>
            </AnalyticsProvider>
            </NativePermissionsOnboardingProvider>
          </AuthProvider>
          </ImageCropperProvider>
        </ThemeProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}

// Wrap with Sentry for automatic crash/performance reporting
export default Sentry.wrap(RootLayout);
