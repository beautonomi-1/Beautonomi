/** Forward-only cutover for product-order VAT carved out of provider_earnings (money path 2h). */
export const PRODUCT_EARNINGS_EXCLUDE_VAT_FROM = "2026-11-03";

export function productEarningsExcludeVatBannerMessage(locale = "en-ZA"): string {
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(
      new Date(`${PRODUCT_EARNINGS_EXCLUDE_VAT_FROM}T12:00:00Z`),
    );
  } catch {
    return PRODUCT_EARNINGS_EXCLUDE_VAT_FROM;
  }
}
