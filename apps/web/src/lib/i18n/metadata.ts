import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";
import { resolveRequestLanguage } from "@/lib/locale/resolve-request-language";
import { buildHreflangAlternates } from "@/lib/seo/hreflang-from-languages";

type PageMetaInput = {
  titleKey: string;
  descriptionKey: string;
  path: string;
  titleVars?: Record<string, string>;
  descriptionVars?: Record<string, string>;
};

/** Translated page metadata for RSC routes. */
export async function buildTranslatedPageMetadata(input: PageMetaInput): Promise<Metadata> {
  const ctx = await resolveRequestLanguage();
  const t = await getServerT(ctx.language);

  const title = t(input.titleKey, input.titleVars ?? {}) as string;
  const description = t(input.descriptionKey, input.descriptionVars ?? {}) as string;
  const path = input.path.startsWith("/") ? input.path : `/${input.path}`;

  return {
    title,
    description,
    alternates: {
      canonical: path,
      languages: buildHreflangAlternates(path, {
        supportedLanguages: ctx.marketSupportedLanguages,
        regionCode: ctx.regionCode,
      }),
    },
    openGraph: {
      title,
      description,
      url: path,
      locale: ctx.formatLocale.replace("-", "_"),
    },
    twitter: {
      title,
      description,
    },
  };
}
