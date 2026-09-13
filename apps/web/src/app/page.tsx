import type { Metadata } from "next";
import { Suspense } from "react";
import HomeMarketplaceHeader from "./home-marketplace-header";
import HomeMarketplaceBody from "./home-marketplace-body";
import HomePageSuspenseFallback from "./home-page-suspense-fallback";
import { buildTranslatedPageMetadata } from "@/lib/i18n/metadata";
import { buildHreflangAlternates } from "@/lib/seo/hreflang-from-languages";
import { getServerT } from "@/lib/i18n/server";
import { resolveRequestLanguage } from "@/lib/locale/resolve-request-language";
import {
  getCategoryLabelForSeo,
  homePathWithCategory,
  normalizeHomeCategoryParam,
} from "./home/home-category-labels";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}): Promise<Metadata> {
  const sp = await searchParams;
  const slug = normalizeHomeCategoryParam(sp.category);
  const label = getCategoryLabelForSeo(slug);
  const path = homePathWithCategory(slug);

  if (slug === "all") {
    return buildTranslatedPageMetadata({
      titleKey: "web.seo.homeTitle",
      descriptionKey: "web.seo.homeDescription",
      path,
    });
  }

  const localeCtx = await resolveRequestLanguage();
  const t = await getServerT(localeCtx.language);
  const title = t("web.seo.categoryTitle", { name: label }) as string;
  const description = t("web.seo.categoryDescription", { name: label }) as string;

  return {
    title,
    description,
    alternates: {
      canonical: path,
      languages: buildHreflangAlternates(path, {
        supportedLanguages: localeCtx.marketSupportedLanguages,
        regionCode: localeCtx.regionCode,
      }),
    },
    openGraph: {
      title,
      description,
      url: path,
    },
    twitter: {
      title,
      description,
    },
  };
}

/**
 * Home listings are cached in `/api/public/home`. This page reads the language
 * cookie so the header / sr-only title cannot hydrate from a stale English RSC
 * payload against a localized LocaleProvider.
 */
export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const sp = await searchParams;
  const slug = normalizeHomeCategoryParam(sp.category);
  const label = getCategoryLabelForSeo(slug);
  const localeCtx = await resolveRequestLanguage();
  const t = await getServerT(localeCtx.language);
  const heroTitle =
    slug === "all"
      ? (t("web.seo.homeSrOnlyTitle") as string)
      : (t("web.seo.homeSrOnlyTitleCategory", { label }) as string);

  return (
    <div className="min-h-screen bg-white pb-20 md:pb-0 w-full max-w-full">
      <Suspense
        fallback={
          <div className="h-[73px] md:h-[88px] border-b border-gray-100 bg-white" aria-hidden />
        }
      >
        <HomeMarketplaceHeader />
      </Suspense>
      {/* Primary document title for SEO + screen readers; not shown visually */}
      <h1 className="sr-only">{heroTitle}</h1>
      {/* overflow-x-hidden only below header — wrapping sticky header breaks tap targets on iPadOS Safari */}
      <div className="w-full max-w-full overflow-x-hidden">
        <Suspense fallback={<HomePageSuspenseFallback />}>
          <HomeMarketplaceBody categoryParam={sp.category} />
        </Suspense>
      </div>
    </div>
  );
}
