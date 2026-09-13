import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";
import { resolveRequestLanguage } from "@/lib/locale/resolve-request-language";
import { hreflangForPath } from "@/lib/seo/metadata-hreflang";

type StaticPageMetaInput = {
  path: string;
  titleKey: string;
  descriptionKey: string;
  robots?: Metadata["robots"];
};

/** Translated metadata for static marketing/legal routes. */
export async function staticPageMetadata(input: StaticPageMetaInput): Promise<Metadata> {
  const ctx = await resolveRequestLanguage();
  const t = await getServerT(ctx.language);
  const path = input.path.startsWith("/") ? input.path : `/${input.path}`;
  const title = t(input.titleKey) as string;
  const description = t(input.descriptionKey) as string;

  return {
    title,
    description,
    ...(input.robots !== undefined ? { robots: input.robots } : {}),
    alternates: {
      canonical: path,
      languages: await hreflangForPath(path),
    },
  };
}
