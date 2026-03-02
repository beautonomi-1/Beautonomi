import { useEffect, useRef } from "react";
import { Linking } from "react-native";
import { fetchAmplitudeConfig } from "@beautonomi/analytics";
import { initAnalytics, handleEngagementURL } from "@/lib/analytics-rn";
import { APP_URL } from "@/config/public-env";
import { useAuth } from "./AuthProvider";

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
        const client = await initAnalytics(config, "client");
        if (cancelled) return;
        analyticsRef.current = client;
      } catch {
        // No-op if config fetch fails (e.g. no keys set)
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
      client.identify(user.id, { phone: user.phone ?? undefined });
    }
  }, [user]);

  return <>{children}</>;
}
