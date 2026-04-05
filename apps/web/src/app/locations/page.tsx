import type { Metadata } from "next";
import Link from "next/link";
import { getPublicSiteOriginFromHeaders } from "@/lib/seo/public-site-origin";
import { getHreflangAlternateUrls } from "@/lib/seo/host-config";
import { SEO_MARKETS } from "@/lib/seo/location-hub-config";
import { LocationHubHero } from "./LocationHubView";

export const revalidate = 600;

export async function generateMetadata(): Promise<Metadata> {
  const origin = await getPublicSiteOriginFromHeaders();
  const path = "/locations";
  return {
    title: "Beauty services by location | Beautonomi",
    description:
      "Browse verified beauty freelancers and salons by country. Find hair, nails, spa, and more on Beautonomi.",
    alternates: {
      canonical: `${origin}${path}`,
      languages: getHreflangAlternateUrls(path),
    },
    openGraph: {
      title: "Beauty services by location | Beautonomi",
      description: "Browse beauty professionals by country on Beautonomi.",
      url: `${origin}${path}`,
      type: "website",
    },
  };
}

export default function LocationsIndexPage() {
  return (
    <>
      <LocationHubHero
        title="Find beauty freelancers & salons near you"
        description="Choose a country to explore cities with verified salons and mobile beauty professionals. Book hair, nails, makeup, spa services, and more on Beautonomi."
      />
      <div className="max-w-[2340px] mx-auto px-4 md:px-8 lg:px-20 py-8 md:py-12">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Browse by country</h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SEO_MARKETS.map((m) => (
            <li key={m.slug}>
              <Link
                href={`/locations/${m.slug}`}
                className="block rounded-xl border border-gray-100 bg-white px-4 py-4 shadow-sm hover:border-[#FF0077]/40 hover:shadow transition"
              >
                <span className="font-medium text-gray-900">{m.name}</span>
                <span className="block text-sm text-gray-500 mt-1">Salons & freelancers</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
