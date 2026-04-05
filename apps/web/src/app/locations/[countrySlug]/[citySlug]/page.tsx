import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicSiteOriginFromHeaders } from "@/lib/seo/public-site-origin";
import { getHreflangAlternateUrls } from "@/lib/seo/host-config";
import {
  citySlugToDisplayName,
  getSeoMarketByCountrySlug,
  isValidLocationSegment,
} from "@/lib/seo/location-hub-config";
import { getLocationHubProviders } from "@/lib/data/get-location-hub-providers";
import { locationHubMetaDescription, locationHubMetaTitle } from "../../location-hub-copy";
import LocationHubView, { LocationHubHero } from "../../LocationHubView";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getCategoryLabelForSeo } from "@/app/home/home-category-labels";

type Props = { params: Promise<{ countrySlug: string; citySlug: string }> };

export const revalidate = 600;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { countrySlug, citySlug } = await params;
  const market = getSeoMarketByCountrySlug(countrySlug);
  const cityName = citySlugToDisplayName(citySlug);
  if (!market || !isValidLocationSegment(countrySlug) || !isValidLocationSegment(citySlug)) {
    return { title: "Not found" };
  }
  const origin = await getPublicSiteOriginFromHeaders();
  const path = `/locations/${market.slug}/${citySlug}`;
  const title = locationHubMetaTitle({ countryName: market.name, cityName });
  const description = locationHubMetaDescription({ countryName: market.name, cityName });
  return {
    title,
    description,
    alternates: {
      canonical: `${origin}${path}`,
      languages: getHreflangAlternateUrls(path),
    },
    openGraph: { title, description, url: `${origin}${path}`, type: "website" },
  };
}

export default async function CityLocationPage({ params }: Props) {
  const { countrySlug, citySlug } = await params;
  if (!isValidLocationSegment(countrySlug) || !isValidLocationSegment(citySlug)) notFound();
  const market = getSeoMarketByCountrySlug(countrySlug);
  if (!market) notFound();

  const cityName = citySlugToDisplayName(citySlug);
  const providers = await getLocationHubProviders({
    cityName,
    countryMatch: market.locationCountryMatch,
    categorySlug: null,
  });

  if (providers.length === 0) notFound();

  const title = `Book beauty freelancers & salons in ${cityName}`;
  const description = locationHubMetaDescription({
    countryName: market.name,
    cityName,
  });

  const origin = (await getPublicSiteOriginFromHeaders()).replace(/\/$/, "");

  const supabase = await getSupabaseServer();
  const { data: categories } = await supabase
    .from("global_service_categories")
    .select("slug")
    .eq("is_active", true)
    .limit(100);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: title,
    description,
    url: `${origin}/locations/${market.slug}/${citySlug}`,
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <LocationHubHero title={title} description={description} />
      <div className="max-w-[2340px] mx-auto px-4 md:px-8 lg:px-20 py-6 border-b border-gray-50">
        <h2 className="text-sm font-semibold text-gray-900 mb-3">Browse by category in {cityName}</h2>
        <div className="flex flex-wrap gap-2">
          {(categories ?? []).map((row: { slug: string }) => (
            <Link
              key={row.slug}
              href={`/locations/${market.slug}/${citySlug}/${row.slug}`}
              className="rounded-full border border-gray-200 px-3 py-1 text-xs md:text-sm text-gray-700 hover:border-[#FF0077] hover:text-[#FF0077]"
            >
              {getCategoryLabelForSeo(row.slug)}
            </Link>
          ))}
        </div>
      </div>
      <LocationHubView
        countrySlug={market.slug}
        citySlug={citySlug}
        cityName={cityName}
        categorySlug={null}
        providers={providers}
      />
    </>
  );
}
