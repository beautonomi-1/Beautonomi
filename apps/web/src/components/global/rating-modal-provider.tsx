"use client";

import { useState, useEffect } from "react";
import RatingModal from "./rating-modal";
import { useRatingModal } from "@/hooks/use-rating-modal";
import { fetcher } from "@/lib/http/fetcher";
import { detectPlatform } from "@/lib/utils/platform";

export default function RatingModalProvider() {
  const { shouldShow, handleClose } = useRatingModal({
    minSessions: 3,
    minDays: 7,
    delay: 2000,
  });
  const [appStoreUrls, setAppStoreUrls] = useState<{
    ios: string | null;
    android: string | null;
  }>({ ios: null, android: null });

  useEffect(() => {
    // Fetch App Store URLs from API
    const loadAppStoreUrls = async () => {
      try {
        const response = await fetcher.get<{
          data: { ios: string | null; android: string | null };
        }>("/api/public/app-store-url");
        if (response.data) {
          setAppStoreUrls({
            ios: response.data.ios,
            android: response.data.android,
          });
        }
      } catch (error) {
        console.error("Failed to load app store URLs:", error);
        // Will use fallback in RatingModal
      }
    };

    loadAppStoreUrls();
  }, []);

  // Detect user's platform and get appropriate URL
  const platform = detectPlatform();
  const appStoreUrl =
    platform === "ios"
      ? appStoreUrls.ios
      : platform === "android"
      ? appStoreUrls.android
      : appStoreUrls.ios || appStoreUrls.android; // Default to iOS if available, else Android

  return (
    <RatingModal
      open={shouldShow}
      onOpenChange={handleClose}
      appStoreUrl={appStoreUrl || undefined}
      platform={platform}
    />
  );
}
