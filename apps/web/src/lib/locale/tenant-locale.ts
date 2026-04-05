import type { ConfigBundleMeta } from "@/lib/config/types";
import type { TenantRegionConfig } from "@/lib/regions/config";

function baseLanguageTag(lang: string | undefined): string {
  const raw = (lang ?? "en").trim();
  if (!raw) return "en";
  const base = raw.split(/[-_]/)[0]?.toLowerCase() ?? "en";
  return /^[a-z]{2}$/.test(base) ? base : "en";
}

/** Shared by client bundle meta and server `getTenantRegionConfig` rows. */
export function buildTenantLocaleTag(
  defaultLanguage: string | undefined,
  regionCode: string | undefined,
): string {
  const lang = baseLanguageTag(defaultLanguage);
  const region = (regionCode ?? "ZA").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(region)) return "en-ZA";
  return `${lang}-${region}`;
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
