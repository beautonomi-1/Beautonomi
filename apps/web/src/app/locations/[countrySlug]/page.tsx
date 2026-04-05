import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicSiteOriginFromHeaders } from "@/lib/seo/public-site-origin";
import { getHreflangAlternateUrls } from "@/lib/seo/host-config";
import {
  cityDisplayToSlug,
  getSeoMarketByCountrySlug,
  isValidLocationSegment,
} from "@/lib/seo/location-hub-config";
import { resolveTenantIdFromServerHeaders } from "@/lib/tenant/resolve-tenant-from-headers";
import { getLocationHubCitiesForCountry, getLocationHubProviders } from "@/lib/data/get-location-hub-providers";
import { locationHubMetaDescription, locationHubMetaTitle } from "../location-hub-copy";
import LocationHubView, { LocationHubHero } from "../LocationHubView";

type Props = { params: Promise<{ countrySlug: string }> };

export const revalidate = 600;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { countrySlug } = await params;
  const market = getSeoMarketByCountrySlug(countrySlug);
  if (!market || !isValidLocationSegment(countrySlug)) {
    return { title: "Not found" };
  }
  const origin = await getPublicSiteOriginFromHeaders();
  const path = `/locations/${market.slug}`;
  const title = locationHubMetaTitle({ countryName: market.name });
  const description = locationHubMetaDescription({ countryName: market.name });
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

export default async function CountryLocationPage({ params }: Props) {
  const { countrySlug } = await params;
  if (!isValidLocationSegment(countrySlug)) notFound();
  const market = getSeoMarketByCountrySlug(countrySlug);
  if (!market) notFound();

  let tenantId: string;
  try {
    tenantId = await resolveTenantIdFromServerHeaders();
  } catch {
    notFound();
  }

  const cities = await getLocationHubCitiesForCountry(market.locationCountryMatch, tenantId);
  const featured = await getLocationHubProviders({
    countryMatch: market.locationCountryMatch,
    categorySlug: null,
  });

  const title = `Beauty freelancers & salons in ${market.name}`;
  const description = locationHubMetaDescription({ countryName: market.name });

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: title,
    description,
    url: `${(await getPublicSiteOriginFromHeaders()).replace(/\/$/, "")}/locations/${market.slug}`,
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <LocationHubHero title={title} description={description} />
      <div className="max-w-[2340px] mx-auto px-4 md:px-8 lg:px-20 py-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Cities in {market.name}</h2>
        {cities.length === 0 ? (
          <p className="text-gray-600 text-sm">
            No indexed providers in this country yet.{" "}
            <Link href="/" className="text-[#FF0077] underline">
              Back to home
            </Link>
          </p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {cities.map((c) => {
              const slug = cityDisplayToSlug(c.city);
              if (!slug) return null;
              return (
                <li key={`${c.city}`}>
                  <Link
                    href={`/locations/${market.slug}/${slug}`}
                    className="flex justify-between gap-2 rounded-lg border border-gray-100 px-3 py-2 text-sm hover:bg-gray-50"
                  >
                    <span className="font-medium text-gray-900">{c.city}</span>
                    <span className="text-gray-500">{c.count}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {featured.length > 0 ? (
        <LocationHubView
          countrySlug={market.slug}
          providers={featured}
          categorySlug={null}
        />
      ) : null}
    </>
  );
}
