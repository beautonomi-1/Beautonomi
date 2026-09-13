import type { Metadata } from "next";
import Link from "next/link";
import { getPublicSiteOriginFromHeaders } from "@/lib/seo/public-site-origin";
import { hreflangForPath } from "@/lib/seo/metadata-hreflang";
import { getServerT } from "@/lib/i18n/server";
import { resolveRequestLanguage } from "@/lib/locale/resolve-request-language";
import { SEO_MARKETS } from "@/lib/seo/location-hub-config";
import { LocationHubHero } from "./LocationHubView";

export const revalidate = 600;

export async function generateMetadata(): Promise<Metadata> {
  const origin = await getPublicSiteOriginFromHeaders();
  const path = "/locations";
  const ctx = await resolveRequestLanguage();
  const t = await getServerT(ctx.language);
  const title = t("web.seo.locationsTitle") as string;
  const description = t("web.seo.locationsDescription") as string;
  return {
    title,
    description,
    alternates: {
      canonical: `${origin}${path}`,
      languages: await hreflangForPath(path),
    },
    openGraph: {
      title,
      description,
      url: `${origin}${path}`,
      type: "website",
    },
  };
}

export default async function LocationsIndexPage() {
  const ctx = await resolveRequestLanguage();
  const t = await getServerT(ctx.language);
  return (
    <>
      <LocationHubHero
        title={t("web.seo.locationsHubTitle") as string}
        description={t("web.seo.locationsHubDescription") as string}
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
