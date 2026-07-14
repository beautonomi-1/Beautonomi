"use client";

import { useEffect, useState } from "react";
import {
  PROVIDER_APPS_FALLBACK,
  type ProviderAppsConfig,
  providerAppsHasAnyLink,
} from "@/lib/store/provider-app-links-client";

export function useProviderAppLinks() {
  const [apps, setApps] = useState<ProviderAppsConfig>(PROVIDER_APPS_FALLBACK);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/public/apps?type=provider");
        if (!res.ok) return;
        const json = (await res.json()) as { data?: ProviderAppsConfig };
        if (!cancelled && json?.data) {
          setApps({ ...PROVIDER_APPS_FALLBACK, ...json.data });
        }
      } catch {
        /* keep fallbacks */
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return {
    apps,
    isLoading,
    hasLinks: providerAppsHasAnyLink(apps),
  };
}
