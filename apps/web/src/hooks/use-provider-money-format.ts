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
    const format = (amount: number) =>
      new Intl.NumberFormat(locale, { style: "currency", currency }).format(amount);
    return { format, currency, locale };
  }, [locale, currency]);
}
