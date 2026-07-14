import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicProviderDetail } from "@/lib/data/getPublicProviderDetail";
import {
  getPublicSiteOriginFromHeaders,
  openGraphLocaleForHost,
} from "@/lib/seo/public-site-origin";
import { getHreflangAlternateUrls } from "@/lib/seo/host-config";
import { headers } from "next/headers";
import BeautonomiHeader from "@/components/layout/beautonomi-header";
import Footer from "@/components/layout/footer";
import BottomNav from "@/components/layout/bottom-nav";
import PartnerProfileClient from "./partner-profile-client";
import ProviderJsonLd from "./components/provider-json-ld";
import { parseCoord, parsePartnerProfileSlug } from "./search-params-helpers";
import { fetchPublicProviderServicesInitial } from "./fetch-public-provider-services";
import { resolvePartnerProfileOpenGraphImageUrl } from "@/lib/seo/partner-profile-open-graph";

export const revalidate = 300;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<Metadata> {
  const sp = await searchParams;
  const slugDecoded = parsePartnerProfileSlug(sp);
  const origin = await getPublicSiteOriginFromHeaders();
  const h = await headers();
  const hostRaw = (h.get("x-forwarded-host") || h.get("host") || "").split(":")[0] || "";
  const path = "/partner-profile";

  if (!slugDecoded) {
    return {
      title: "Provider Profile | Beautonomi",
      description: "Discover beauty services from verified providers on Beautonomi",
    };
  }

  const lat = parseCoord(sp.lat);
  const lng = parseCoord(sp.lng);
  const { provider, providerFull } = await getPublicProviderDetail(slugDecoded, lat, lng);
  if (!provider || !providerFull) {
    return {
      title: "Provider Not Found | Beautonomi",
      description: "The provider you're looking for doesn't exist on Beautonomi.",
    };
  }

  const title = `${provider.business_name} | Beautonomi`;
  const locationText =
    provider.city && provider.country
      ? `${provider.city}, ${provider.country}`
      : provider.city || provider.country || "";
  const description = providerFull.description
    ? `${providerFull.description.substring(0, 155)}${providerFull.description.length > 155 ? "..." : ""}`
    : `Discover ${provider.business_name} on Beautonomi${locationText ? ` in ${locationText}` : ""}. ${
        provider.rating ? `Rated ${provider.rating.toFixed(1)}/5` : ""
      }${provider.review_count ? ` with ${provider.review_count} reviews` : ""}.`;

  const profileUrl = `${origin}${path}?slug=${encodeURIComponent(slugDecoded)}`;
  const ogImage = resolvePartnerProfileOpenGraphImageUrl(origin, slugDecoded, provider);

  return {
    title,
    description,
    alternates: {
      canonical: profileUrl,
      languages: getHreflangAlternateUrls(`${path}?slug=${encodeURIComponent(slugDecoded)}`),
    },
    openGraph: {
      title,
      description,
      siteName: "Beautonomi",
      url: profileUrl,
      images: [{ url: ogImage, width: 1200, height: 630, alt: `${provider.business_name} on Beautonomi` }],
      locale: openGraphLocaleForHost(hostRaw),
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
    robots: (provider as any).seo_indexable === false ? { index: false, follow: false } : undefined,
  };
}

export default async function PartnerProfilePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const slug = parsePartnerProfileSlug(sp);

  if (!slug) {
    return (
      <div className="min-h-screen bg-white pb-20 md:pb-0">
        <BeautonomiHeader />
        <div className="container mx-auto px-4 py-16 text-center">
          <h1 className="text-2xl font-semibold text-gray-900 mb-2">Provider not found</h1>
          <p className="text-gray-500 mb-4">Please provide a provider slug.</p>
          <a href="/" className="text-[#FF0077] hover:underline">Go Home</a>
        </div>
        <Footer />
        <BottomNav />
      </div>
    );
  }

  const lat = parseCoord(sp.lat);
  const lng = parseCoord(sp.lng);

  const [{ provider }, initialServiceCategories] = await Promise.all([
    getPublicProviderDetail(slug, lat, lng),
    fetchPublicProviderServicesInitial(slug),
  ]);

  if (!provider) {
    notFound();
  }

  const origin = await getPublicSiteOriginFromHeaders();

  return (
    <div className="min-h-screen bg-white pb-20 md:pb-0 w-full max-w-full">
      <ProviderJsonLd provider={provider} origin={origin} slug={provider.slug} />
      <BeautonomiHeader />
      <div className="w-full max-w-full overflow-x-hidden">
      <PartnerProfileClient
        provider={provider}
        initialServiceCategories={initialServiceCategories}
      />
      </div>
      <Footer />
      <BottomNav />
    </div>
  );
}
