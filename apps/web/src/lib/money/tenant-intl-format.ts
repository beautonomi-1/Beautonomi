import { getTenantRegionConfig } from "@/lib/regions/config";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { getTenantLocaleTagFromRegionConfig } from "@/lib/locale/tenant-locale";

/**
 * Intl currency formatter for a tenant (server routes). Uses region default currency + locale tag.
 */
export async function getTenantMoneyFormatter(
  tenantId: string | null | undefined,
): Promise<{ format: (amount: number) => string; currency: string; locale: string }> {
  const region = tenantId ? await getTenantRegionConfig(tenantId) : null;
  const currency = region?.defaultCurrency ?? LAST_RESORT_CURRENCY;
  const locale = getTenantLocaleTagFromRegionConfig(region);
  const format = (amount: number) =>
    new Intl.NumberFormat(locale, { style: "currency", currency }).format(amount);
  return { format, currency, locale };
}
