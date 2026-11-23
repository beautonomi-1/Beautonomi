"use client";

import { useMemo } from "react";
import { useProviderPortal } from "@/providers/provider-portal/ProviderPortalProvider";
import { useTenantLocaleTag } from "@/hooks/useTenantLocaleTag";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";

/**
 * Tenant-aligned currency formatting for provider portal pages (from `/api/provider/profile`: currency + locale).
 */
export function useProviderMoneyFormat() {
  const { provider } = useProviderPortal();
  const tenantLocaleFallback = useTenantLocaleTag();
  const locale = provider?.locale ?? tenantLocaleFallback;
  const currency = provider?.currency ?? LAST_RESORT_CURRENCY;

  return useMemo(() => {
    const format = (amount: number | string | null | undefined) => {
      const n = typeof amount === "number" ? amount : Number(amount);
      const safe = Number.isFinite(n) ? n : 0;
      const code = /^[A-Za-z]{3}$/.test(currency) ? currency.toUpperCase() : LAST_RESORT_CURRENCY;
      try {
        return new Intl.NumberFormat(locale || "en-ZA", {
          style: "currency",
          currency: code,
        }).format(safe);
      } catch {
        return `${code} ${safe.toFixed(2)}`;
      }
    };
    return { format, currency, locale };
  }, [locale, currency]);
}
