import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicSiteOriginFromHeaders } from "@/lib/seo/public-site-origin";
import { getHreflangAlternateUrls } from "@/lib/seo/host-config";
import {
  citySlugToDisplayName,
  getSeoMarketByCountrySlug,
  isValidLocationSegment,
} from "@/lib/seo/location-hub-config";
import { getLocationHubProviders } from "@/lib/data/get-location-hub-providers";
import { getSupabaseServer } from "@/lib/supabase/server";
import { locationHubMetaDescription, locationHubMetaTitle } from "../../../location-hub-copy";
import LocationHubView, { LocationHubHero } from "../../../LocationHubView";

type Props = {
  params: Promise<{ countrySlug: string; citySlug: string; categorySlug: string }>;
};

export const revalidate = 600;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { countrySlug, citySlug, categorySlug } = await params;
  const market = getSeoMarketByCountrySlug(countrySlug);
  const cityName = citySlugToDisplayName(citySlug);
  if (
    !market ||
    !isValidLocationSegment(countrySlug) ||
    !isValidLocationSegment(citySlug) ||
    !isValidLocationSegment(categorySlug)
  ) {
    return { title: "Not found" };
  }

  const supabase = await getSupabaseServer();
  const { data: cat } = await supabase
    .from("global_service_categories")
    .select("slug")
    .eq("slug", categorySlug)
    .eq("is_active", true)
    .maybeSingle();
  if (!cat) return { title: "Not found" };

  const origin = await getPublicSiteOriginFromHeaders();
  const path = `/locations/${market.slug}/${citySlug}/${categorySlug}`;
  const title = locationHubMetaTitle({
    countryName: market.name,
    cityName,
    categorySlug,
  });
  const description = locationHubMetaDescription({
    countryName: market.name,
    cityName,
    categorySlug,
  });
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

export default async function CityCategoryLocationPage({ params }: Props) {
  const { countrySlug, citySlug, categorySlug } = await params;
  if (
    !isValidLocationSegment(countrySlug) ||
    !isValidLocationSegment(citySlug) ||
    !isValidLocationSegment(categorySlug)
  ) {
    notFound();
  }
  const market = getSeoMarketByCountrySlug(countrySlug);
  if (!market) notFound();

  const supabase = await getSupabaseServer();
  const { data: cat } = await supabase
    .from("global_service_categories")
    .select("slug, name")
    .eq("slug", categorySlug)
    .eq("is_active", true)
    .maybeSingle();
  if (!cat) notFound();

  const cityName = citySlugToDisplayName(citySlug);
  const providers = await getLocationHubProviders({
    cityName,
    countryMatch: market.locationCountryMatch,
    categorySlug,
  });

  if (providers.length === 0) notFound();

  const title = locationHubMetaTitle({
    countryName: market.name,
    cityName,
    categorySlug,
  });
  const description = locationHubMetaDescription({
    countryName: market.name,
    cityName,
    categorySlug,
  });

  const origin = (await getPublicSiteOriginFromHeaders()).replace(/\/$/, "");
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: title,
    description,
    url: `${origin}/locations/${market.slug}/${citySlug}/${categorySlug}`,
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <LocationHubHero title={title} description={description} />
      <LocationHubView
        countrySlug={market.slug}
        citySlug={citySlug}
        cityName={cityName}
        categorySlug={categorySlug}
        providers={providers}
      />
    </>
  );
}
