"use client";

import { useEffect, useState, useRef } from "react";
import { useAuth } from "@/providers/AuthProvider";

// Track if we've already warned about SDK not loading (module-level to persist across renders)
let hasWarnedAboutSdkNotLoaded = false;

/**
 * Hook to register device with OneSignal
 * 
 * Call this in customer/provider/admin layouts to register devices
 */
export function useOneSignal() {
  const { user } = useAuth();
  const [isRegistered, setIsRegistered] = useState(false);
  const [isOneSignalReady, setIsOneSignalReady] = useState(false);
  const hasWarnedRef = useRef(false);

  // Wait for OneSignal to be available
  useEffect(() => {
    if (typeof window === "undefined") return;

    const appId = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;
    
    // Only check for OneSignal if App ID is configured
    if (!appId) {
      return;
    }

    // Check if OneSignal is already loaded
    if ((window as any).OneSignal) {
      queueMicrotask(() => setIsOneSignalReady(true));
      return;
    }

    // Poll for OneSignal to be loaded (in case script loads after this hook runs)
    const checkInterval = setInterval(() => {
      if ((window as any).OneSignal) {
        setIsOneSignalReady(true);
        clearInterval(checkInterval);
      }
    }, 100);

    // Cleanup after 10 seconds if OneSignal still isn't loaded
    const timeout = setTimeout(() => {
      clearInterval(checkInterval);
      if (!(window as any).OneSignal && !hasWarnedAboutSdkNotLoaded && !hasWarnedRef.current && process.env.NODE_ENV === "development") {
        console.warn("OneSignal SDK not loaded after 10 seconds. Make sure the script is included in the page.");
        hasWarnedAboutSdkNotLoaded = true;
        hasWarnedRef.current = true;
      }
    }, 10000);

    return () => {
      clearInterval(checkInterval);
      clearTimeout(timeout);
    };
  }, []);

  useEffect(() => {
    if (!user || !isOneSignalReady) return;

    const OneSignal = (window as any).OneSignal;
    const appId = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;

    if (!appId) {
      // App ID warning is handled in OneSignalProvider, so we just return silently here
      return;
    }

    // Initialize OneSignal if not already initialized
    try {
      OneSignal.init({
        appId: appId,
        notifyButton: {
          enable: false, // We'll handle notifications in-app
        },
        allowLocalhostAsSecureOrigin: true,
      });
    } catch (error) {
      // OneSignal might already be initialized
      if (process.env.NODE_ENV === "development") {
        console.log("OneSignal already initialized or initialization error:", error);
      }
    }

    // Register device when user is logged in
    OneSignal.getUserId()
      .then((playerId: string | null) => {
        if (playerId) {
          registerDevice(playerId);
        } else {
          // Wait for user ID to be available
          OneSignal.on("subscriptionChange", (isSubscribed: boolean) => {
            if (isSubscribed) {
              OneSignal.getUserId().then((pid: string | null) => {
                if (pid) {
                  registerDevice(pid);
                }
              });
            }
          });
        }
      })
      .catch((error: any) => {
        if (process.env.NODE_ENV === "development") {
          console.error("Error getting OneSignal user ID:", error);
        }
      });

    async function registerDevice(playerId: string) {
      if (isRegistered) return;

      try {
        // Determine platform
        const platform = /iPhone|iPad|iPod/.test(navigator.userAgent)
          ? "ios"
          : /Android/.test(navigator.userAgent)
          ? "android"
          : "web";

        // Register with backend
        const response = await fetch("/api/me/devices", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            player_id: playerId,
            platform,
          }),
        });

        if (response.ok) {
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
  }, [user, isOneSignalReady, isRegistered]);

  return { isRegistered };
}
