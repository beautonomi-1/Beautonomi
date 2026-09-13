import { buildFormatLocale, normalizeLanguageCode } from "@beautonomi/i18n/language-registry";
import {
  getConfiguredGlobalEntryHost,
  getConfiguredZaMarketHost,
  normalizeHostLabel,
} from "@/lib/seo/host-config";

/**
 * Map region code → canonical market hostname.
 *
 * Extensibility: new markets are added by setting `NEXT_PUBLIC_<REGION>_MARKET_HOST`
 * env vars (e.g. NEXT_PUBLIC_NG_MARKET_HOST). Unknown regions fall back to the
 * global entry host. No code changes needed when adding a tenant/market — just
 * set the env var and add a `regions` row in the database.
 */
const REGION_HOST_OVERRIDES: Record<string, string | undefined> = {
  ZA: getConfiguredZaMarketHost(),
  US: getConfiguredGlobalEntryHost(),
  GB: process.env.NEXT_PUBLIC_UK_MARKET_HOST?.trim() || "beautonomi.co.uk",
  NG: process.env.NEXT_PUBLIC_NG_MARKET_HOST?.trim() || "ng.beautonomi.com",
  KE: process.env.NEXT_PUBLIC_KE_MARKET_HOST?.trim() || "ke.beautonomi.com",
  GH: process.env.NEXT_PUBLIC_GH_MARKET_HOST?.trim() || "gh.beautonomi.com",
  EG: process.env.NEXT_PUBLIC_EG_MARKET_HOST?.trim() || "eg.beautonomi.com",
  CI: process.env.NEXT_PUBLIC_CI_MARKET_HOST?.trim() || "ci.beautonomi.com",
  FR: process.env.NEXT_PUBLIC_FR_MARKET_HOST?.trim() || "fr.beautonomi.com",
  DE: process.env.NEXT_PUBLIC_DE_MARKET_HOST?.trim() || "de.beautonomi.com",
  ES: process.env.NEXT_PUBLIC_ES_MARKET_HOST?.trim() || "es.beautonomi.com",
  PT: process.env.NEXT_PUBLIC_PT_MARKET_HOST?.trim() || "pt.beautonomi.com",
  BR: process.env.NEXT_PUBLIC_BR_MARKET_HOST?.trim() || "br.beautonomi.com",
  AE: process.env.NEXT_PUBLIC_AE_MARKET_HOST?.trim() || "ae.beautonomi.com",
  SA: process.env.NEXT_PUBLIC_SA_MARKET_HOST?.trim() || "sa.beautonomi.com",
  AU: process.env.NEXT_PUBLIC_AU_MARKET_HOST?.trim() || "au.beautonomi.com",
};

function hostForRegion(regionCode: string | undefined): string {
  const code = (regionCode ?? "ZA").trim().toUpperCase();
  return REGION_HOST_OVERRIDES[code] ?? getConfiguredGlobalEntryHost();
}

/**
 * Build hreflang alternates from tenant supported languages + active region.
 * Uses BCP-47 tags (e.g. en-ZA, fr-FR) as keys per Google guidance.
 */
export function buildHreflangAlternates(
  pathname: string,
  options?: {
    supportedLanguages?: readonly string[];
    regionCode?: string;
  },
): Record<string, string> {
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const regionCode = (options?.regionCode ?? "ZA").trim().toUpperCase();
  const host = normalizeHostLabel(hostForRegion(regionCode));
  const langs = options?.supportedLanguages?.length
    ? options.supportedLanguages
    : ["en"];

  const out: Record<string, string> = {};
  for (const raw of langs) {
    const lang = normalizeLanguageCode(raw);
    const tag = buildFormatLocale(lang, regionCode);
    out[tag] = `https://${host}${path}`;
  }

  out["x-default"] = `https://${normalizeHostLabel(getConfiguredGlobalEntryHost())}${path}`;
  return out;
}
