import { buildFormatLocale } from "@beautonomi/i18n/language-registry";
import type { ConfigBundleMeta } from "@/lib/config/types";
import type { TenantRegionConfig } from "@/lib/regions/config";

/** Shared by client bundle meta and server `getTenantRegionConfig` rows. */
export function buildTenantLocaleTag(
  defaultLanguage: string | undefined,
  regionCode: string | undefined,
): string {
  return buildFormatLocale(defaultLanguage ?? "en", regionCode ?? "ZA");
}

/**
 * BCP 47 locale tag for `Intl` from public config bundle `tenant_region`.
 * Falls back to `en-ZA` when metadata is missing (legacy default).
 */
export function getTenantLocaleTagFromMeta(meta: ConfigBundleMeta | null | undefined): string {
  const tr = meta?.tenant_region;
  if (!tr) return "en-ZA";
  return buildTenantLocaleTag(tr.default_language, tr.code);
}

/** Server routes: same tag logic as the config bundle, from `getTenantRegionConfig`. */
export function getTenantLocaleTagFromRegionConfig(
  config: Pick<TenantRegionConfig, "defaultLanguage" | "regionCode"> | null | undefined,
): string {
  if (!config) return "en-ZA";
  return buildTenantLocaleTag(config.defaultLanguage, config.regionCode);
}
