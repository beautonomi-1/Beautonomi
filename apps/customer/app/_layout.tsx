import "../global.css";
import "@/lib/i18n";
import React, { useEffect, useState } from "react";
import { Platform, Text, TouchableOpacity, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { SafeAreaProvider, initialWindowMetrics } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "@/providers/AuthProvider";
import { NotificationsProvider } from "@/providers/NotificationsContext";
import { SelectedAddressProvider } from "@/providers/SelectedAddressProvider";
import { AnalyticsProvider } from "@/providers/AnalyticsProvider";
import { ConfigBundleProvider } from "@/providers/ConfigBundleProvider";
import { NativePermissionsOnboardingProvider } from "@/providers/NativePermissionsOnboardingProvider";
import { PushNotificationsProvider } from "@/providers/PushNotificationsProvider";
import { ThemeProvider, useTheme } from "@/providers/ThemeProvider";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { OfflineBar } from "@/components/OfflineBar";
import { useForceUpdate } from "@/hooks/useForceUpdate";
import { initSentry, setMobileAppTag, Sentry } from "@/lib/sentry";
import { initSingular } from "@/lib/singular";
import { i18n } from "@beautonomi/i18n";
import MarketAvailabilityGate from "@/components/MarketAvailabilityGate";
import {
  initializeRuntimeMarketHost,
  startRuntimeMarketHostLinkListener,
} from "@/config/public-env";
import { ScreenshotDeepLinkBootstrap } from "@/components/ScreenshotDeepLinkBootstrap";
import { configureNativePushNotifications } from "@/lib/push-notifications-setup";
import { ImageCropperProvider } from "@/components/image-crop";
import { KeyboardRootProvider } from "@/providers/KeyboardRootProvider";
import { InAppBannerProvider } from "@/providers/InAppBannerProvider";

if (Platform.OS !== "web") {
  SplashScreen.preventAutoHideAsync();
  SplashScreen.setOptions({ fade: true, duration: 350 });
}

/** Max time splash can stay visible; then hide so auth/login can render. */
const MAX_SPLASH_MS = 4000;

try {
  initSentry();
  setMobileAppTag("customer");
} catch {}
try {
  initSingular();
} catch {}
if (Platform.OS !== "web") {
  configureNativePushNotifications();
}

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
          A newer version of Beautonomi is required to keep bookings, payments, and account features working correctly.
        </Text>
        <TouchableOpacity
          onPress={openUpdate}
          accessibilityRole="button"
          accessibilityLabel="Update Beautonomi now"
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
  // §UI-audit 2026-05: route the resolved theme into the Stack content
  // background so navigation transitions (and any screen that doesn't
  // pick its own background colour) match the user's Light/Dark choice
  // instead of always flashing white.
  const stackBackground = isDark ? "#0B0B10" : "#FFFFFF";

  return (
    <>
      <SplashController />
      <OfflineBar />
      <ForceUpdateGate>
        <PushNotificationsProvider>
          <ScreenshotDeepLinkBootstrap />
          <Stack
            screenOptions={{
              headerShown: false,
              freezeOnBlur: true,
              contentStyle: {
                flex: 1,
                backgroundColor: stackBackground,
                ...(Platform.OS === "web" ? { width: "100%", minHeight: "100%" } : {}),
              },
            }}
          >
            <Stack.Screen name="index" />
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="auth" />
            <Stack.Screen name="(app)" />
          </Stack>
        </PushNotificationsProvider>
      </ForceUpdateGate>
      <StatusBar style={isDark ? "light" : "dark"} />
      <MarketAvailabilityGate />
    </>
  );
}

function LanguageReactiveRoot({ children }: { children: React.ReactNode }) {
  const [, setLocale] = useState(() => i18n.language || "en");
  useEffect(() => {
    const handler = (lng: string) => setLocale(lng || "en");
    i18n.on("languageChanged", handler);
    return () => i18n.off("languageChanged", handler);
  }, []);
  return <>{children}</>;
}

function RootLayout() {
  const isWeb = Platform.OS === "web";
  const rootStyle: View["props"]["style"] = {
    flex: 1,
    ...(isWeb ? { width: "100%", minHeight: "100%" } : {}),
  };
  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={rootStyle}>
        <SafeAreaProvider initialMetrics={initialWindowMetrics}>
          <KeyboardRootProvider>
          <MarketHostBootstrap />
          <ThemeProvider>
            <ImageCropperProvider>
            <LanguageReactiveRoot>
            <AuthProvider>
              <NativePermissionsOnboardingProvider>
              <NotificationsProvider>
              <SelectedAddressProvider>
                <AnalyticsProvider>
                  <ConfigBundleProvider>
                    <InAppBannerProvider>
                      <ThemedApp />
                    </InAppBannerProvider>
                  </ConfigBundleProvider>
                </AnalyticsProvider>
              </SelectedAddressProvider>
              </NotificationsProvider>
              </NativePermissionsOnboardingProvider>
            </AuthProvider>
            </LanguageReactiveRoot>
            </ImageCropperProvider>
          </ThemeProvider>
          </KeyboardRootProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}

function MarketHostBootstrap() {
  useEffect(() => {
    void initializeRuntimeMarketHost();
    const unsubscribe = startRuntimeMarketHostLinkListener();
    return unsubscribe;
  }, []);
  return null;
}

export default Sentry.wrap(RootLayout);
