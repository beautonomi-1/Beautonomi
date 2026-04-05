import type { Metadata } from "next";
import Link from "next/link";
import { MapPin } from "lucide-react";
import { getProvidersByCity } from "@/lib/data/getProvidersByCity";
import ProviderCard from "@/app/home/components/provider-card-dynamic";
import Navbar from "@/components/layout/navbar";
import Footer from "@/components/layout/footer";
import { getPublicSiteOriginFromHeaders } from "@/lib/seo/public-site-origin";
import { getHreflangAlternateUrls } from "@/lib/seo/host-config";

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

  return {
    title: `Beauty Providers in ${cityName} | Beautonomi`,
    description: `Discover top-rated beauty and salon providers in ${cityName}. Book services from verified professionals on Beautonomi.`,
    alternates: {
      canonical: `${origin}${path}`,
      languages: getHreflangAlternateUrls(path),
    },
    openGraph: {
      title: `Beauty Providers in ${cityName} | Beautonomi`,
      description: `Discover top-rated beauty and salon providers in ${cityName}.`,
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
              <h2 className="text-xl font-medium text-gray-900 mb-2">No providers in {cityName} yet</h2>
              <p className="text-gray-500 mb-4">Check back later or browse other locations.</p>
              <Link href="/" className="text-[#FF0077] hover:underline">
                Browse all
              </Link>
            </div>
          ) : (
            <>
              <p className="text-gray-600 mb-6">
                {providers.length} {providers.length === 1 ? "provider" : "providers"} in this area
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 gap-y-10 justify-start">
                {providers.map((provider) => (
                  <ProviderCard key={provider.id} provider={provider} />
                ))}
              </div>
            </>
          )}
          <div className="mt-8">
            <Link href="/" className="text-sm text-[#FF0077] hover:underline">
              ← Back to home
            </Link>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
