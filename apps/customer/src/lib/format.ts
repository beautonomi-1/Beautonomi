import { formatMoney, formatMoneyCompact, normalizeCurrencyCode } from "@beautonomi/utils";
import { getTenantDefaultCurrency } from "@/lib/config-bundle";

/** Customer app money formatting — tenant region currency + device locale. */
export function formatCurrency(
  amount: number,
  currency = getTenantDefaultCurrency(),
  locale?: string,
): string {
  const code = normalizeCurrencyCode(currency);
  const resolvedLocale = locale ?? Intl.DateTimeFormat().resolvedOptions().locale ?? "en-ZA";
  return formatMoney(amount, code, resolvedLocale);
}

export function formatCurrencyCompact(
  amount: number,
  currency = getTenantDefaultCurrency(),
  locale?: string,
): string {
  const code = normalizeCurrencyCode(currency);
  const resolvedLocale = locale ?? Intl.DateTimeFormat().resolvedOptions().locale ?? "en-ZA";
  return formatMoneyCompact(amount, code, resolvedLocale);
}
