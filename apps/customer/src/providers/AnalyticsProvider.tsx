import { useEffect, useRef } from "react";
import { Linking } from "react-native";
import { fetchAmplitudeConfig } from "@beautonomi/analytics";
import {
  initAnalytics,
  handleEngagementURL,
  getMobileAnalyticsAttribution,
  captureMarketingAttributionFromUrl,
  getCachedFirstTouchForIdentify,
} from "@/lib/analytics-rn";
import { setAnalyticsInstance } from "@/lib/analytics";
import { APP_URL } from "@/config/public-env";
import { api } from "@/lib/api-client";
import { useAuth } from "./AuthProvider";

type AnalyticsClient = NonNullable<Awaited<ReturnType<typeof initAnalytics>>>;

export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const clientRef = useRef<AnalyticsClient | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        if (user) {
          const consentRes = await api.get<{ analytics_consent?: boolean }>(
            "/api/me/analytics/consent"
          );
          if (cancelled) return;
          if (consentRes.error) {
            console.log("[Analytics] Skipped: consent check failed (fail-closed)");
            try {
              clientRef.current?.reset();
            } catch {
              /* ignore */
            }
            clientRef.current = null;
            setAnalyticsInstance(null);
            return;
          }
          if (consentRes.data?.analytics_consent === false) {
            console.log("[Analytics] Skipped: analytics consent declined");
            try {
              clientRef.current?.reset();
            } catch {
              /* ignore */
            }
            clientRef.current = null;
            setAnalyticsInstance(null);
            return;
          }
        }

        const config = await fetchAmplitudeConfig(
          APP_URL,
          __DEV__ ? "development" : "production"
        );
        if (cancelled) return;

        const enableSessionReplay = Boolean(user);
        const client = await initAnalytics(config, "client", { enableSessionReplay });
        if (cancelled) return;

        if (client) {
          const initialUrl = await Linking.getInitialURL();
          await captureMarketingAttributionFromUrl(initialUrl);
        }

        clientRef.current = client;

        if (client) {
          setAnalyticsInstance({ logEvent: client.track, identify: client.identify });
        } else {
          setAnalyticsInstance(null);
        }

        if (user && client) {
          try {
            const res = await api.post<Record<string, unknown>>("/api/me/analytics/identify", {
              portal: "client",
              ...getMobileAnalyticsAttribution(),
              ...getCachedFirstTouchForIdentify(),
            });
            if (cancelled) return;
            if (res.error) {
              console.error("[Analytics] Identify API error:", res.error);
              return;
            }
            if (!res.data || typeof res.data !== "object") {
              console.error("[Analytics] Identify API returned no properties (fail-closed)");
              return;
            }
            client.identify(user.id, res.data as Record<string, unknown>);
          } catch (e) {
            console.error("[Analytics] Identify request failed:", e);
          }
        }
      } catch {
        clientRef.current = null;
        setAnalyticsInstance(null);
      }
    })();

    return () => {
      cancelled = true;
      try {
        clientRef.current?.reset();
      } catch {
        /* ignore */
      }
      clientRef.current = null;
      setAnalyticsInstance(null);
    };
  }, [user]);

  // Deep links: Amplitude Guides/Surveys + marketing attribution (UTM / click ids).
  useEffect(() => {
    let cancelled = false;
    Linking.getInitialURL()
      .then(async (url) => {
        try {
          if (cancelled || !url) return;
          const handled = await handleEngagementURL(url);
          if (handled) return;
        } catch {
          /* ignore */
        }
      })
      .catch(() => {
        /* ignore */
      });
    const subscription = Linking.addEventListener("url", async ({ url }) => {
      await captureMarketingAttributionFromUrl(url);
      const handled = await handleEngagementURL(url);
      if (handled) return;
    });
    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  return <>{children}</>;
}
