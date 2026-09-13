import { useCallback, useMemo } from "react";
import { formatMoney } from "@beautonomi/utils";
import { useCustomerDisplayCurrency } from "@/hooks/useCustomerDisplayCurrency";

/**
 * Memoised browse formatter respecting the user's saved display currency.
 * Checkout and payment screens should continue to show charge currency prominently.
 */
export function useFormatCurrency() {
  const { displayCurrencyForFormatting, tenantDefaultCurrency, profilePreferredCurrency, loading } =
    useCustomerDisplayCurrency();

  const format = useCallback(
    (amount: number, chargeCurrency?: string | null) => {
      const charge = (chargeCurrency?.trim().toUpperCase() || tenantDefaultCurrency).trim();
      const display = profilePreferredCurrency ?? charge;
      if (display === charge) {
        return formatMoney(amount, charge);
      }
      return formatMoney(amount, display);
    },
    [tenantDefaultCurrency, profilePreferredCurrency],
  );

  return useMemo(
    () => ({
      loading,
      tenantDefaultCurrency,
      profilePreferredCurrency,
      displayCurrency: displayCurrencyForFormatting,
      formatCurrency: format,
    }),
    [loading, tenantDefaultCurrency, profilePreferredCurrency, displayCurrencyForFormatting, format],
  );
}
