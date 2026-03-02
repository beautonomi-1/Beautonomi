"use client";

import { usePathname } from "next/navigation";
import { useRef, useEffect, useCallback, useState } from "react";
import { useAmplitude } from "@/hooks/useAmplitude";
import { fetcher } from "@/lib/http/fetcher";
import DownloadBanner from "./DownloadBanner";
import type { OsType } from "@/lib/utils/os-type";

const DISMISS_KEY = "download_banner_dismissed";

const CTA_LABELS: Record<"ios" | "android" | "huawei", string> = {
  ios: "Download on the App Store",
  android: "Get it on Google Play",
  huawei: "Get it on AppGallery",
};

const DESTINATION: Record<"ios" | "android" | "huawei", "app_store" | "google_play" | "app_gallery"> = {
  ios: "app_store",
  android: "google_play",
  huawei: "app_gallery",
};

/** Store link from admin/CMS (platform_settings.apps). Used by download banner. */
interface AppPlatformConfig {
  enabled?: boolean;
  app_store_url?: string;
  download_url?: string;
  app_gallery_url?: string;
}

function getStoreLinkFromEnv(appContext: "customer" | "provider", osType: "ios" | "android" | "huawei"): string | null {
  const prefix = appContext === "customer" ? "NEXT_PUBLIC_CUSTOMER" : "NEXT_PUBLIC_PROVIDER";
  const suffix = osType === "ios" ? "IOS" : osType === "android" ? "ANDROID" : "HUAWEI";
  const key = `${prefix}_${suffix}_LINK`;
  return typeof process.env[key] === "string" && process.env[key] ? (process.env[key] as string) : null;
}

function getStoreLinkFromAppsData(
  data: Record<string, AppPlatformConfig> | null | undefined,
  osType: "ios" | "android" | "huawei"
): string | null {
  if (!data) return null;
  const platform = data[osType];
  if (!platform?.enabled) return null;
  if (osType === "ios") return platform.app_store_url ?? null;
  if (osType === "android") return platform.download_url ?? null;
  return platform.app_gallery_url ?? null;
}

interface DownloadBannerContainerProps {
  osType: OsType;
}

export function DownloadBannerContainer({ osType }: DownloadBannerContainerProps) {
  const pathname = usePathname();
  const { track } = useAmplitude();
  const viewedSentRef = useRef(false);

  const appContext = pathname?.startsWith("/become-a-partner") ? "provider" : "customer";

  const mobileOs = osType === "ios" || osType === "android" || osType === "huawei" ? osType : null;

  // Prefer admin/CMS (platform_settings.apps) from /api/public/apps; fallback to env
  const [linkUrl, setLinkUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!mobileOs) {
      setLinkUrl(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetcher.get<{ data: Record<string, AppPlatformConfig> }>(
          `/api/public/apps?type=${appContext}`
        );
        if (cancelled) return;
        const fromCms = getStoreLinkFromAppsData(res?.data, mobileOs);
        if (fromCms) {
          setLinkUrl(fromCms);
          return;
        }
      } catch {
        // ignore, use env fallback
      }
      if (cancelled) return;
      setLinkUrl(getStoreLinkFromEnv(appContext, mobileOs));
    })();
    return () => {
      cancelled = true;
    };
  }, [appContext, mobileOs]);

  const ctaLabel = mobileOs ? CTA_LABELS[mobileOs] : "";
  const destination = mobileOs ? DESTINATION[mobileOs] : null;

  const [dismissed, setDismissed] = useState(false);

  const checkDismissed = useCallback((): boolean => {
    if (typeof sessionStorage === "undefined") return true;
    try {
      const raw = sessionStorage.getItem(DISMISS_KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw) as Record<string, boolean>;
      return parsed[appContext] === true;
    } catch {
      return false;
    }
  }, [appContext]);

  useEffect(() => {
    setDismissed(checkDismissed());
  }, [checkDismissed]);

  const handleDismiss = useCallback(() => {
    try {
      const raw = sessionStorage.getItem(DISMISS_KEY);
      const parsed = raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
      parsed[appContext] = true;
      sessionStorage.setItem(DISMISS_KEY, JSON.stringify(parsed));
    } catch {
      // ignore
    }
    setDismissed(true);
  }, [appContext]);

  useEffect(() => {
    if (!linkUrl || dismissed || viewedSentRef.current) return;
    viewedSentRef.current = true;
    track("download_banner_viewed", {
      app_context: appContext,
      os_type: osType,
      destination: destination ?? undefined,
      pathname: pathname ?? "",
      link_url: linkUrl,
    });
  }, [linkUrl, dismissed, appContext, osType, destination, pathname, track]);

  const handleTrackClick = useCallback(() => {
    if (!linkUrl) return;
    track("download_banner_clicked", {
      app_context: appContext,
      os_type: osType,
      destination: destination ?? undefined,
      pathname: pathname ?? "",
      link_url: linkUrl,
    });
  }, [linkUrl, appContext, osType, destination, pathname, track]);

  if (osType === "desktop" || osType === "other" || !linkUrl || dismissed) {
    return null;
  }

  return (
    <DownloadBanner
      linkUrl={linkUrl}
      ctaLabel={ctaLabel}
      onDismiss={handleDismiss}
      onTrackClick={handleTrackClick}
    />
  );
}
