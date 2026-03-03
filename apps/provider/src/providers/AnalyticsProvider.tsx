import { useEffect, useRef } from "react";
import { Linking } from "react-native";
import { fetchAmplitudeConfig } from "@beautonomi/analytics";
import { initAnalytics, handleEngagementURL } from "@/lib/analytics-rn";
import { APP_URL } from "@/config/public-env";
import { useAuth } from "./AuthProvider";
import { setAnalyticsInstance, identifyProvider } from "@/lib/analytics";

export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const analyticsRef = useRef<Awaited<ReturnType<typeof initAnalytics>> | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const config = await fetchAmplitudeConfig(
          APP_URL,
          __DEV__ ? "development" : "production"
        );
        if (cancelled) return;
        const client = await initAnalytics(config, "provider");
        if (cancelled) return;
        analyticsRef.current = client;

        // Bridge to the analytics module for use throughout the app
        if (client) {
          setAnalyticsInstance({
            logEvent: client.track,
            identify: client.identify,
          });
        }
      } catch {
        // No-op if config fetch fails
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Deep links for Amplitude Guides & Surveys (preview, etc.). Same API key / CDP as web.
  useEffect(() => {
    let cancelled = false;
    Linking.getInitialURL().then(async (url) => {
      if (cancelled || !url) return;
      const handled = await handleEngagementURL(url);
      if (handled) return;
      // App can handle non-Amplitude URLs (e.g. notification deep links) elsewhere
    });
    const subscription = Linking.addEventListener("url", async ({ url }) => {
      const handled = await handleEngagementURL(url);
      if (handled) return;
    });
    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    const client = analyticsRef.current;
    if (client && user) {
      // Set comprehensive user properties for provider segmentation
      identifyProvider(user.id, {
        role: user.user_metadata?.role ?? "provider_owner",
        provider_id: user.user_metadata?.provider_id,
        country: user.user_metadata?.country,
        city: user.user_metadata?.city,
      });
    }
  }, [user]);

  return <>{children}</>;
}
