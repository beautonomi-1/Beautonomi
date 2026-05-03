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
    <div className="inline-flex max-w-full flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] leading-tight text-gray-500">
      <Globe className="h-3 w-3 shrink-0 text-gray-400" aria-hidden />
      <span className="font-medium text-gray-600">Region</span>
      <span className="text-gray-300">·</span>
      <a href={zaUrl} className="text-primary hover:underline">
        South Africa ({zaLabel})
      </a>
      <span className="text-gray-300">·</span>
      <a href={globalUrl} className="hover:underline text-gray-600">
        International (.com)
      </a>
    </div>
  );
}
