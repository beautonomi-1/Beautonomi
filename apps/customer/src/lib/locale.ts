import { buildFormatLocale, i18n } from "@beautonomi/i18n";
import { getCachedConfigBundle } from "@/lib/config-bundle";

/**
 * BCP 47 tag for `Intl` date/time formatting.
 * Uses the in-app UI language when i18n is loaded, else tenant default from the config bundle.
 */
export function getTenantLocaleTag(): string {
  const meta = getCachedConfigBundle()?.meta?.tenant_region;
  const language = i18n?.language || meta?.default_language || "en";
  const region = meta?.code ?? "ZA";
  return buildFormatLocale(language, region);
}
