"use client";

import { useMemo } from "react";
import { useConfigBundle } from "@/providers/ConfigBundleProvider";
import { getTenantLocaleTagFromMeta } from "@/lib/locale/tenant-locale";

/** Locale for `Intl` date/number formatting from the active tenant (config bundle). */
export function useTenantLocaleTag(): string {
  const { bundle } = useConfigBundle();
  return useMemo(() => getTenantLocaleTagFromMeta(bundle?.meta ?? null), [bundle?.meta]);
}
