"use client";

import { useEffect, useState, useRef } from "react";
import { useAuth } from "@/providers/AuthProvider";
import { useCookieConsent } from "@/providers/CookieConsentProvider";

interface OneSignalSDK {
  init?(opts: { appId: string; notifyButton?: { enable: boolean }; allowLocalhostAsSecureOrigin?: boolean }): void;
  getUserId?(): Promise<string | null>;
  on?(event: string, cb: (v: boolean) => void): void;
  logout?(): void;
}

declare global {
  interface Window {
    OneSignal?: OneSignalSDK;
  }
}

let hasWarnedAboutSdkNotLoaded = false;

/**
 * Hook to register device with OneSignal
 *
 * Call this in customer/provider/admin layouts to register devices
 */
export function useOneSignal() {
  const { user } = useAuth();
  const { isReady: consentReady, allowsFunctional } = useCookieConsent();
  const [isRegistered, setIsRegistered] = useState(false);
  const [isOneSignalReady, setIsOneSignalReady] = useState(false);
  const hasWarnedRef = useRef(false);
  const prevUserIdRef = useRef<string | null>(null);
  const registeredPlayerIdRef = useRef<string | null>(null);

  // Wait for OneSignal to be available
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!consentReady || !allowsFunctional) return;

    const appId = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;

    if (!appId) {
      return;
    }

    if (window.OneSignal) {
      queueMicrotask(() => setIsOneSignalReady(true));
      return;
    }

    const checkInterval = setInterval(() => {
      if (window.OneSignal) {
        setIsOneSignalReady(true);
        clearInterval(checkInterval);
      }
    }, 100);

    const timeout = setTimeout(() => {
      clearInterval(checkInterval);
      if (!window.OneSignal && !hasWarnedAboutSdkNotLoaded && !hasWarnedRef.current && process.env.NODE_ENV === "development") {
        console.warn("OneSignal SDK not loaded after 10 seconds. Make sure the script is included in the page.");
        hasWarnedAboutSdkNotLoaded = true;
        hasWarnedRef.current = true;
      }
    }, 10000);

    return () => {
      clearInterval(checkInterval);
      clearTimeout(timeout);
    };
  }, [consentReady, allowsFunctional]);

  useEffect(() => {
    if (!consentReady || !allowsFunctional) return;
    if (!user || !isOneSignalReady) return;

    const OneSignal = window.OneSignal;
    const appId = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;

    if (!appId) {
      return;
    }

    try {
      OneSignal?.init?.({
        appId: appId,
        notifyButton: {
          enable: false,
        },
        allowLocalhostAsSecureOrigin: true,
      });
    } catch (error) {
      if (process.env.NODE_ENV === "development") {
        console.log("OneSignal already initialized or initialization error:", error);
      }
    }

    OneSignal?.getUserId?.()
      .then((playerId: string | null) => {
        if (playerId) {
          registerDevice(playerId);
        } else {
          OneSignal?.on?.("subscriptionChange", (isSubscribed: boolean) => {
            if (isSubscribed) {
              OneSignal?.getUserId?.().then((pid: string | null) => {
                if (pid) {
                  registerDevice(pid);
                }
              }).catch(() => {});
            }
          });
        }
      })
      .catch((error: unknown) => {
        if (process.env.NODE_ENV === "development") {
          console.error("Error getting OneSignal user ID:", error);
        }
      });

    async function registerDevice(playerId: string) {
      if (isRegistered && registeredPlayerIdRef.current === playerId) return;

      try {
        const platform = /iPhone|iPad|iPod/.test(navigator.userAgent)
          ? "ios"
          : /Android/.test(navigator.userAgent)
          ? "android"
          : "web";

        const response = await fetch("/api/me/devices", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            player_id: playerId,
            platform,
            app_type: "customer",
          }),
        });

        if (response.ok) {
          registeredPlayerIdRef.current = playerId;
          setIsRegistered(true);
          if (process.env.NODE_ENV === "development") {
            console.log("Device registered with OneSignal");
          }
        } else {
          if (process.env.NODE_ENV === "development") {
            console.error("Failed to register device:", await response.text());
          }
        }
      } catch (error) {
        console.error("Error registering device:", error);
      }
    }
  }, [user, isOneSignalReady, isRegistered, consentReady, allowsFunctional]);

  useEffect(() => {
    const prevUserId = prevUserIdRef.current;
    prevUserIdRef.current = user?.id ?? null;

    if (prevUserId && !user?.id) {
      const playerId = registeredPlayerIdRef.current;
      setIsRegistered(false);
      registeredPlayerIdRef.current = null;

      void (async () => {
        try {
          window.OneSignal?.logout?.();
        } catch {
          // SDK may be unavailable
        }
        if (!playerId) return;
        try {
          await fetch("/api/me/devices", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ player_id: playerId }),
          });
        } catch {
          // best-effort cleanup
        }
      })();
    }
  }, [user?.id]);

  return { isRegistered };
}
