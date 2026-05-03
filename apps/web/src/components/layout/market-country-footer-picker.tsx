"use client";

import { useMemo } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Globe } from "lucide-react";
import {
  getConfiguredGlobalEntryHost,
  getConfiguredZaMarketHost,
  normalizeHostLabel,
} from "@/lib/seo/host-config";

export function MarketCountryFooterPicker() {
  const pathname = usePathname() || "/";
  const searchParams = useSearchParams();
  const searchString = searchParams?.toString() ?? "";

  const { zaUrl, globalUrl, zaLabel } = useMemo(() => {
    const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
    const qs = searchString ? `?${searchString}` : "";
    const zaHost = normalizeHostLabel(getConfiguredZaMarketHost()) || "beautonomi.co.za";
    const globalHost = normalizeHostLabel(getConfiguredGlobalEntryHost()) || "beautonomi.com";
    return {
      zaUrl: `https://${zaHost}${path}${qs}`,
      globalUrl: `https://${globalHost}${path}${qs}`,
      zaLabel: zaHost,
    };
  }, [pathname, searchString]);

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-gray-600">
      <Globe className="h-4 w-4 shrink-0 text-gray-500" aria-hidden />
      <span className="font-medium text-gray-800">Region</span>
      <span className="text-gray-400">·</span>
      <a href={zaUrl} className="text-primary hover:underline">
        South Africa ({zaLabel})
      </a>
      <span className="text-gray-400">·</span>
      <a href={globalUrl} className="hover:underline text-gray-700">
        International (.com)
      </a>
    </div>
  );
}
