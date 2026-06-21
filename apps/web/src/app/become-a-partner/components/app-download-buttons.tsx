"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";
import { NATIVE_STORE } from "@/lib/store/native-app-store";
import { Smartphone } from "lucide-react";

interface AppPlatformConfig {
  enabled?: boolean;
  app_store_url?: string;
  download_url?: string;
  app_gallery_url?: string;
}

type ProviderApps = {
  ios?: AppPlatformConfig;
  android?: AppPlatformConfig;
  huawei?: AppPlatformConfig;
};

const FALLBACK: ProviderApps = {
  ios: { app_store_url: NATIVE_STORE.provider.defaultAppStoreUrl, enabled: true },
  android: { download_url: NATIVE_STORE.provider.defaultPlayStoreUrl, enabled: true },
  huawei: {
    app_gallery_url: "https://appgallery.huawei.com/app/C100000001",
    enabled: true,
  },
};

function resolveUrl(platform: AppPlatformConfig | undefined, kind: "ios" | "android" | "huawei"): string | null {
  if (!platform || platform.enabled === false) return null;
  if (kind === "ios") return platform.app_store_url ?? FALLBACK.ios?.app_store_url ?? null;
  if (kind === "android") return platform.download_url ?? FALLBACK.android?.download_url ?? null;
  return platform.app_gallery_url ?? FALLBACK.huawei?.app_gallery_url ?? null;
}

export default function AppDownloadButtons() {
  const [apps, setApps] = useState<ProviderApps>(FALLBACK);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/public/apps?type=provider");
        if (!res.ok) return;
        const json = (await res.json()) as { data?: ProviderApps };
        if (!cancelled && json?.data) setApps({ ...FALLBACK, ...json.data });
      } catch {
        /* keep fallbacks */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const iosUrl = resolveUrl(apps.ios, "ios");
  const androidUrl = resolveUrl(apps.android, "android");
  const huaweiUrl = resolveUrl(apps.huawei, "huawei");

  if (!iosUrl && !androidUrl && !huaweiUrl) return null;

  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-gray-500">Get the provider app</p>
        <p className="mt-1 max-w-sm text-sm text-gray-600">
          Run your business from your phone — bookings, clients, and payments on the go.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        {iosUrl ? (
          <a
            href={iosUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-900 shadow-sm transition hover:border-primary/30 hover:shadow-md"
          >
            <Image src="/images/apple-173-svgrepo-com.svg" alt="" width={20} height={20} className="h-5 w-5" />
            App Store
          </a>
        ) : null}
        {androidUrl ? (
          <a
            href={androidUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-900 shadow-sm transition hover:border-primary/30 hover:shadow-md"
          >
            <Image src="/images/playstore-svgrepo-com.svg" alt="" width={20} height={20} className="h-5 w-5" />
            Google Play
          </a>
        ) : null}
        {huaweiUrl ? (
          <a
            href={huaweiUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-900 shadow-sm transition hover:border-primary/30 hover:shadow-md"
          >
            <Smartphone className="h-5 w-5 text-gray-600" aria-hidden />
            AppGallery
          </a>
        ) : null}
      </div>
    </div>
  );
}
