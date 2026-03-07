import "../global.css";
import "@/lib/i18n";
import React, { useEffect } from "react";
import { Platform, View } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "@/providers/AuthProvider";
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
            <AuthProvider>
              <SelectedAddressProvider>
                <AnalyticsProvider>
                  <ConfigBundleProvider>
                    <ThemedApp />
                  </ConfigBundleProvider>
                </AnalyticsProvider>
              </SelectedAddressProvider>
            </AuthProvider>
          </ThemeProvider>
        </SafeAreaProvider>
      </View>
    </ErrorBoundary>
  );
}

export default Sentry.wrap(RootLayout);
