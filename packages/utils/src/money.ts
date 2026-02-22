/**
 * Money formatting utilities
 */

export function formatMoney(
  amount: number,
  currency: string = "ZAR",
  locale: string = "en-ZA"
): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  }).format(amount);
}
