import type { Metadata } from "next";
import Link from "next/link";
import { MapPin } from "lucide-react";
import { getProvidersByCity } from "@/lib/data/getProvidersByCity";
import ProviderCard from "@/app/home/components/provider-card-dynamic";
import Navbar from "@/components/layout/navbar";
import Footer from "@/components/layout/footer";
import { getPublicSiteOriginFromHeaders } from "@/lib/seo/public-site-origin";
import { hreflangForPath } from "@/lib/seo/metadata-hreflang";
import { getServerT } from "@/lib/i18n/server";
import { resolveRequestLanguage } from "@/lib/locale/resolve-request-language";

export const revalidate = 600;

function slugToCityName(slug: string): string {
  return slug
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const cityName = slugToCityName(slug);
  const origin = await getPublicSiteOriginFromHeaders();
  const path = `/location/${slug}`;
  const ctx = await resolveRequestLanguage();
  const t = await getServerT(ctx.language);
  const title = t("web.seo.locationCityTitle", { city: cityName }) as string;
  const description = t("web.seo.locationCityDescription", { city: cityName }) as string;

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
      siteName: "Beautonomi",
      type: "website",
    },
  };
}

export default async function LocationPage({ params }: { params: Params }) {
  const { slug } = await params;
  const cityName = slugToCityName(slug);
  const providers = await getProvidersByCity(cityName);

  return (
    <div>
      <Navbar />
      <div className="mb-10 mt-7">
        <div className="max-w-[2340px] mx-auto px-10">
          <div className="flex items-center gap-2 mb-5">
            <MapPin className="h-6 w-6 md:h-8 md:w-8 text-[#FF0077]" aria-hidden />
            <h1 className="text-2xl md:text-[32px] font-normal">Providers in {cityName}</h1>
          </div>
          {providers.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-600 mb-4">No providers found in {cityName} yet.</p>
              <Link href="/search" className="text-[#FF0077] hover:underline">
                Search all providers
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {providers.map((provider) => (
                <ProviderCard key={provider.id} provider={provider} />
              ))}
            </div>
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
}
