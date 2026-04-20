import { i18n } from "@beautonomi/i18n";
import { getCachedConfigBundle } from "@/lib/config-bundle";

function baseLanguageTag(lang: string | undefined): string {
  const raw = (lang ?? "en").trim();
  if (!raw) return "en";
  const base = raw.split(/[-_]/)[0]?.toLowerCase() ?? "en";
  return /^[a-z]{2}$/.test(base) ? base : "en";
}

function activeUiLanguageBase(): string | undefined {
  const lng = i18n?.language;
  if (lng) return baseLanguageTag(lng);
  return undefined;
}

/**
 * BCP 47 tag for `Intl` date/time formatting.
 * Uses the in-app UI language when i18n is loaded, else tenant default from the config bundle.
 */
export function getTenantLocaleTag(): string {
  const meta = getCachedConfigBundle()?.meta?.tenant_region;
  const lang = baseLanguageTag(activeUiLanguageBase() ?? meta?.default_language);
  const region = (meta?.code ?? "ZA").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(region)) return "en-ZA";
  return `${lang}-${region}`;
}
