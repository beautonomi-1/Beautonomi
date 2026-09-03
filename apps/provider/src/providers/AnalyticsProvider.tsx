import { useEffect, useRef } from "react";
import { AppState, InteractionManager, Linking } from "react-native";
import { fetchAmplitudeConfig } from "@beautonomi/analytics";
import {
  initAnalytics,
  resetAnalyticsModule,
  handleEngagementURL,
  getMobileAnalyticsAttribution,
  captureMarketingAttributionFromUrl,
  getCachedFirstTouchForIdentify,
} from "@/lib/analytics-rn";
import { APP_URL } from "@/config/public-env";
import { api } from "@/lib/api-client";
import { setAnalyticsInstance, trackAppOpen, trackDeepLinkOpened } from "@/lib/analytics";
import { setSingularCustomUserId, unsetSingularCustomUserId } from "@/lib/singular";

/** Process-lifetime guard: `app_open{cold_start:true}` fires once per JS runtime. */
let coldStartTracked = false;
import { useAuth } from "./AuthProvider";
import { attBootstrapPromise } from "@/lib/tracking/request-att-before-tracking";

type AnalyticsClient = NonNullable<Awaited<ReturnType<typeof initAnalytics>>>;

export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const clientRef = useRef<AnalyticsClient | null>(null);

  useEffect(() => {
    let cancelled = false;
    let deferredHandle: { cancel?: () => void } | null = null;

    const runBootstrap = () => {
      if (cancelled) return;
      void (async () => {
        try {
          await attBootstrapPromise;
          if (cancelled) return;

          if (user) {
            const consentRes = await api.get<{ analytics_consent?: boolean }>(
              "/api/me/analytics/consent"
            );
            if (cancelled) return;
            if (consentRes.error) {
              if (__DEV__) {
                console.log("[Analytics] Skipped: consent check failed (fail-closed)");
              }
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
              if (__DEV__) {
                console.log("[Analytics] Skipped: analytics consent declined");
              }
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

          const client = await initAnalytics(config, "provider");
          if (cancelled) return;

          if (client) {
            const initialUrl = await Linking.getInitialURL();
            await captureMarketingAttributionFromUrl(initialUrl);
          }

          clientRef.current = client;

          if (client) {
            setAnalyticsInstance({
              logEvent: client.track,
              identify: client.identify,
            });
            if (!coldStartTracked) {
              coldStartTracked = true;
              const initialUrl = await Linking.getInitialURL().catch(() => null);
              trackAppOpen(true, initialUrl ? "deep_link" : "direct");
              if (initialUrl) trackDeepLinkOpened(initialUrl, "cold_start");
            }
          } else {
            setAnalyticsInstance(null);
          }

          if (user && client) {
            try {
              const res = await api.post<Record<string, unknown>>("/api/me/analytics/identify", {
                portal: "provider",
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
              const providerId = (res.data as { provider_id?: unknown }).provider_id;
              if (typeof providerId === "string" && providerId) {
                client.setGroup("provider", providerId);
              }
              setSingularCustomUserId(user.id);
            } catch (e) {
              console.error("[Analytics] Identify request failed:", e);
            }
          }
        } catch {
          clientRef.current = null;
          setAnalyticsInstance(null);
        }
      })();
    };

    // Cold login: defer Amplitude/native init until after first paint + transitions so Sentry
    // "App hanging" is less likely when config bundle + auth shell compete on the JS thread.
    if (!user) {
      deferredHandle = InteractionManager.runAfterInteractions(() => {
        if (cancelled) return;
        requestAnimationFrame(runBootstrap);
      });
    } else {
      runBootstrap();
    }

    return () => {
      cancelled = true;
      deferredHandle?.cancel?.();
      try {
        clientRef.current?.reset();
      } catch {
        /* ignore */
      }
      unsetSingularCustomUserId();
      resetAnalyticsModule();
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
      await attBootstrapPromise;
      await captureMarketingAttributionFromUrl(url);
      trackDeepLinkOpened(url, "warm");
      const handled = await handleEngagementURL(url);
      if (handled) return;
    });
    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  // Reliability: flush the queue when the app backgrounds and emit a warm `app_open` on resume.
  useEffect(() => {
    let previous = AppState.currentState;
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "background" || next === "inactive") {
        try {
          clientRef.current?.flush?.();
        } catch {
          /* ignore */
        }
      } else if (next === "active" && previous !== "active" && clientRef.current) {
        trackAppOpen(false, "direct");
      }
      previous = next;
    });
    return () => sub.remove();
  }, []);

  return <>{children}</>;
}
