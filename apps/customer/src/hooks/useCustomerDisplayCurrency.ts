import { useMemo } from "react";
import { useApi } from "@/hooks/useApi";
import { getTenantDefaultCurrency } from "@/lib/config-bundle";

type ProfileRow = {
  preferred_currency?: string | null;
};

/**
 * Optional hook for screens that should **respect the user’s saved currency** (Account → Language & region)
 * when formatting amounts, instead of only the tenant config bundle default.
 *
 * - **`tenantDefaultCurrency`** — same as `getTenantDefaultCurrency()` (market bundle); what most screens use today.
 * - **`profilePreferredCurrency`** — `users.preferred_currency` when set; `null` if unset.
 * - **`displayCurrencyForFormatting`** — `profilePreferred ?? tenantDefault` for opt-in labels.
 *
 * Do not call this on every list row; prefer a parent fetch or the bundle default for hot paths.
 */
export function useCustomerDisplayCurrency() {
  const { data, loading, error, refresh } = useApi<ProfileRow>("/api/me/profile");
  const tenantDefaultCurrency = useMemo(() => getTenantDefaultCurrency(), []);
  const profilePreferredCurrency = useMemo(() => {
    const c = data?.preferred_currency?.trim();
    return c || null;
  }, [data?.preferred_currency]);

  const displayCurrencyForFormatting = profilePreferredCurrency ?? tenantDefaultCurrency;

  return {
    loading,
    error,
    refresh,
    tenantDefaultCurrency,
    profilePreferredCurrency,
    displayCurrencyForFormatting,
  };
}
