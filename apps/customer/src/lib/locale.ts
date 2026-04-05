import { getCachedConfigBundle } from "@/lib/config-bundle";

function baseLanguageTag(lang: string | undefined): string {
  const raw = (lang ?? "en").trim();
  if (!raw) return "en";
  const base = raw.split(/[-_]/)[0]?.toLowerCase() ?? "en";
  return /^[a-z]{2}$/.test(base) ? base : "en";
}

/**
 * BCP 47 tag for `Intl` date/time formatting from tenant region (public config bundle).
 * Falls back to `en-ZA` when the bundle is missing or incomplete.
 */
export function getTenantLocaleTag(): string {
  const meta = getCachedConfigBundle()?.meta?.tenant_region;
  const lang = baseLanguageTag(meta?.default_language);
  const region = (meta?.code ?? "ZA").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(region)) return "en-ZA";
  return `${lang}-${region}`;
}
