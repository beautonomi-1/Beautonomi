import { buildHreflangAlternates } from "@/lib/seo/hreflang-from-languages";
import { resolveRequestLanguage } from "@/lib/locale/resolve-request-language";

/** Hreflang map for generateMetadata (uses cookie + tenant supported languages). */
export async function hreflangForPath(pathname: string): Promise<Record<string, string>> {
  const ctx = await resolveRequestLanguage();
  return buildHreflangAlternates(pathname, {
    supportedLanguages: ctx.marketSupportedLanguages,
    regionCode: ctx.regionCode,
  });
}
