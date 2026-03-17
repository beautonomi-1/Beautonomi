import "../global.css";
import "@/lib/i18n";
import React, { useEffect, useState } from "react";
import { Platform, View } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "@/providers/AuthProvider";
import { NotificationsProvider } from "@/providers/NotificationsContext";
import { SelectedAddressProvider } from "@/providers/SelectedAddressProvider";
import { AnalyticsProvider } from "@/providers/AnalyticsProvider";
import { ConfigBundleProvider } from "@/providers/ConfigBundleProvider";
import { PushNotificationsProvider } from "@/providers/PushNotificationsProvider";
import { ThemeProvider, useTheme } from "@/providers/ThemeProvider";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { OfflineBar } from "@/components/OfflineBar";
import { useForceUpdate } from "@/hooks/useForceUpdate";
import { initSentry, Sentry } from "@/lib/sentry";
import { initSingular } from "@/lib/singular";
import { i18n } from "@beautonomi/i18n";

if (Platform.OS !== "web") {
  SplashScreen.preventAutoHideAsync();
}

try {
  initSentry();
} catch {}
try {
  initSingular();
} catch {}

function SplashController() {
  const { loading } = useAuth();
  useEffect(() => {
    if (!loading && Platform.OS !== "web") SplashScreen.hideAsync();
  }, [loading]);
  return null;
}

function ForceUpdateGate({ children }: { children: React.ReactNode }) {
  const { updateRequired } = useForceUpdate();
  if (updateRequired) {
    return <View style={{ flex: 1, backgroundColor: "#fff" }} />;
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
        <PushNotificationsProvider>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: {
                flex: 1,
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
      <View style={rootStyle}>
        <SafeAreaProvider>
          <ThemeProvider>
            <LanguageReactiveRoot>
            <AuthProvider>
              <NotificationsProvider>
              <SelectedAddressProvider>
                <AnalyticsProvider>
                  <ConfigBundleProvider>
                    <ThemedApp />
                  </ConfigBundleProvider>
                </AnalyticsProvider>
              </SelectedAddressProvider>
              </NotificationsProvider>
            </AuthProvider>
            </LanguageReactiveRoot>
          </ThemeProvider>
        </SafeAreaProvider>
      </View>
    </ErrorBoundary>
  );
}

export default Sentry.wrap(RootLayout);
