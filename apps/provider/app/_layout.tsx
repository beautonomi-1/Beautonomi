import "../global.css";
import "@/lib/i18n";
import { useEffect } from "react";
import { Platform, View } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "@/providers/AuthProvider";
import { AnalyticsProvider } from "@/providers/AnalyticsProvider";
import { ConfigBundleProvider } from "@/providers/ConfigBundleProvider";
import { PushNotificationsProvider } from "@/providers/PushNotificationsProvider";
import { ThemeProvider, useTheme } from "@/providers/ThemeProvider";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { OfflineBar } from "@/components/OfflineBar";
import { useForceUpdate } from "@/hooks/useForceUpdate";
import { initSentry, Sentry } from "@/lib/sentry";
import { initSingular } from "@/lib/singular";

// Initialize Sentry and Singular before anything renders; catch so a failure doesn't crash the app
try {
  initSentry();
} catch {}
try {
  initSingular();
} catch {}

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
              contentStyle: { flex: 1, backgroundColor: "#ffffff" },
            }}
          >
            <Stack.Screen name="index" />
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(app)" />
          </Stack>
        </PushNotificationsProvider>
      </ForceUpdateGate>
      <StatusBar style={isDark ? "light" : "dark"} />
    </>
  );
}

function RootLayout() {
  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <ThemeProvider>
          <AuthProvider>
            <AnalyticsProvider>
              <ConfigBundleProvider>
                <ThemedApp />
              </ConfigBundleProvider>
            </AnalyticsProvider>
          </AuthProvider>
        </ThemeProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}

// Wrap with Sentry for automatic crash/performance reporting
export default Sentry.wrap(RootLayout);
