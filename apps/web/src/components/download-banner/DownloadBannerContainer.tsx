"use client";

import { usePathname } from "next/navigation";
import { useRef, useEffect, useCallback, useState } from "react";
import { useAmplitude } from "@/hooks/useAmplitude";
import { fetcher } from "@/lib/http/fetcher";
import DownloadBanner from "./DownloadBanner";
import type { DownloadBannerStore } from "./DownloadBanner";
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
  if (!platform || platform.enabled === false) return null;
  if (osType === "ios") return platform.app_store_url ?? null;
  if (osType === "android") return platform.download_url ?? null;
  return platform.app_gallery_url ?? null;
}

function resolveStoreUrl(
  data: Record<string, AppPlatformConfig> | null | undefined,
  appContext: "customer" | "provider",
  osType: "ios" | "android" | "huawei"
): string | null {
  return getStoreLinkFromAppsData(data, osType) ?? getStoreLinkFromEnv(appContext, osType);
}

interface ResolvedLinks {
  ios: string | null;
  android: string | null;
  huawei: string | null;
}

interface DownloadBannerContainerProps {
  osType: OsType;
}

export function DownloadBannerContainer({ osType }: DownloadBannerContainerProps) {
  const pathname = usePathname();
  const { track } = useAmplitude();
  const viewedSentRef = useRef(false);

  const appContext = pathname?.startsWith("/become-a-partner") ? "provider" : "customer";

  useEffect(() => {
    viewedSentRef.current = false;
  }, [appContext]);

  const mobileOs = osType === "ios" || osType === "android" || osType === "huawei" ? osType : null;
  const isDesktopLike = osType === "desktop" || osType === "other";

  const [links, setLinks] = useState<ResolvedLinks>({ ios: null, android: null, huawei: null });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetcher.get<{ data: Record<string, AppPlatformConfig> }>(
          `/api/public/apps?type=${appContext}`
        );
        if (cancelled) return;
        const d = res?.data;
        setLinks({
          ios: resolveStoreUrl(d, appContext, "ios"),
          android: resolveStoreUrl(d, appContext, "android"),
          huawei: resolveStoreUrl(d, appContext, "huawei"),
        });
      } catch {
        if (cancelled) return;
        setLinks({
          ios: getStoreLinkFromEnv(appContext, "ios"),
          android: getStoreLinkFromEnv(appContext, "android"),
          huawei: getStoreLinkFromEnv(appContext, "huawei"),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [appContext]);

  const mobileLink = mobileOs
    ? mobileOs === "ios"
      ? links.ios
      : mobileOs === "android"
        ? links.android
        : links.huawei
    : null;

  const desktopHeadline =
    appContext === "provider"
      ? "Get the Beautonomi Partner app on your phone"
      : "Get the Beautonomi app on your phone";

  const hasAnyDesktopLink = Boolean(links.ios || links.android || links.huawei);

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

  const showMobile = Boolean(mobileOs && mobileLink && !dismissed);
  const showDesktop = Boolean(isDesktopLike && hasAnyDesktopLink && !dismissed);

  useEffect(() => {
    if (dismissed || viewedSentRef.current) return;
    if (!showMobile && !showDesktop) return;
    viewedSentRef.current = true;
    if (showMobile && mobileOs && mobileLink) {
      track("download_banner_viewed", {
        app_context: appContext,
        variant: "mobile",
        os_type: osType,
        destination: DESTINATION[mobileOs],
        pathname: pathname ?? "",
        link_url: mobileLink,
      });
    } else if (showDesktop) {
      track("download_banner_viewed", {
        app_context: appContext,
        variant: "desktop",
        os_type: osType,
        pathname: pathname ?? "",
        ios_url: links.ios ?? undefined,
        android_url: links.android ?? undefined,
        huawei_url: links.huawei ?? undefined,
      });
    }
  }, [
    dismissed,
    showMobile,
    showDesktop,
    mobileOs,
    mobileLink,
    appContext,
    osType,
    pathname,
    track,
    links.ios,
    links.android,
    links.huawei,
  ]);

  const handleMobileTrackClick = useCallback(() => {
    if (!mobileLink || !mobileOs) return;
    track("download_banner_clicked", {
      app_context: appContext,
      variant: "mobile",
      os_type: osType,
      destination: DESTINATION[mobileOs],
      pathname: pathname ?? "",
      link_url: mobileLink,
    });
  }, [mobileLink, mobileOs, appContext, osType, pathname, track]);

  const handleDesktopStoreClick = useCallback(
    (store: DownloadBannerStore, url: string) => {
      track("download_banner_clicked", {
        app_context: appContext,
        variant: "desktop",
        os_type: osType,
        destination: DESTINATION[store],
        pathname: pathname ?? "",
        link_url: url,
      });
    },
    [appContext, osType, pathname, track]
  );

  if (dismissed) return null;

  if (showMobile && mobileOs && mobileLink) {
    return (
      <DownloadBanner
        variant="mobile"
        linkUrl={mobileLink}
        ctaLabel={CTA_LABELS[mobileOs]}
        store={mobileOs}
        onDismiss={handleDismiss}
        onTrackClick={handleMobileTrackClick}
      />
    );
  }

  if (showDesktop) {
    return (
      <DownloadBanner
        variant="desktop"
        headline={desktopHeadline}
        iosUrl={links.ios}
        androidUrl={links.android}
        huaweiUrl={links.huawei}
        onDismiss={handleDismiss}
        onStoreClick={handleDesktopStoreClick}
      />
    );
  }

  return null;
}
