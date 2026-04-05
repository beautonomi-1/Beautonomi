import type { Metadata } from "next";
import { Suspense } from "react";
import HomeMarketplaceHeader from "./home-marketplace-header";
import HomeMarketplaceBody from "./home-marketplace-body";
import HomePageSuspenseFallback from "./home-page-suspense-fallback";
import { getHreflangAlternateUrls } from "@/lib/seo/host-config";
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
    return {
      title: "Beauty Services Marketplace",
      description:
        "Discover and book beauty services from verified providers near you.",
      alternates: {
        canonical: path,
        languages: getHreflangAlternateUrls(path),
      },
      openGraph: {
        title: "Beauty Services Marketplace",
        description:
          "Discover and book beauty services from verified providers near you.",
        url: path,
      },
      twitter: {
        title: "Beauty Services Marketplace",
        description:
          "Discover and book beauty services from verified providers near you.",
      },
    };
  }

  const title = `${label} — Book verified beauty professionals`;
  const description = `Find ${label.toLowerCase()} services from verified salons and professionals near you. Book on Beautonomi.`;

  return {
    title,
    description,
    alternates: {
      canonical: path,
      languages: getHreflangAlternateUrls(path),
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

/** Tenant + category from URL; home API is cached internally. */
export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const sp = await searchParams;
  const slug = normalizeHomeCategoryParam(sp.category);
  const label = getCategoryLabelForSeo(slug);
  const heroTitle =
    slug === "all"
      ? "Discover and book verified beauty professionals"
      : `${label} — book trusted beauty professionals near you`;

  return (
    <div className="min-h-screen bg-white pb-20 md:pb-0 overflow-x-hidden w-full max-w-full">
      <Suspense
        fallback={
          <div className="h-[73px] md:h-[88px] border-b border-gray-100 bg-white" aria-hidden />
        }
      >
        <HomeMarketplaceHeader />
      </Suspense>
      {/* Primary document title for SEO + screen readers; not shown visually */}
      <h1 className="sr-only">{heroTitle}</h1>
      <Suspense fallback={<HomePageSuspenseFallback />}>
        <HomeMarketplaceBody categoryParam={sp.category} />
      </Suspense>
    </div>
  );
}
