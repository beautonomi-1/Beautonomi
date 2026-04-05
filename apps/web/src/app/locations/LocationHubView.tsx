import Link from "next/link";
import { MapPin } from "lucide-react";
import ProviderCard from "@/app/home/components/provider-card-dynamic";
import type { PublicProviderCard } from "@/types/beautonomi";
import {
  sectionFreelancersTitle,
  sectionSalonsTitle,
  sectionTopRatedTitle,
} from "./location-hub-copy";

function sortByRating(list: PublicProviderCard[]): PublicProviderCard[] {
  return [...list].sort(
    (a, b) =>
      b.rating - a.rating ||
      b.review_count - a.review_count ||
      (b.is_verified ? 1 : 0) - (a.is_verified ? 1 : 0),
  );
}

function SectionBlock({
  title,
  providers,
}: {
  title: string;
  providers: PublicProviderCard[];
}) {
  if (providers.length === 0) return null;
  const slice = providers.slice(0, 8);
  return (
    <section className="mb-10 md:mb-14">
      <div className="max-w-[2340px] mx-auto px-4 md:px-8 lg:px-20">
        <h2 className="text-lg md:text-2xl font-semibold text-gray-900 mb-4 md:mb-6">{title}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 gap-y-10">
          {slice.map((p) => (
            <ProviderCard key={p.id} provider={p} />
          ))}
        </div>
      </div>
    </section>
  );
}

export default function LocationHubView({
  cityName,
  categorySlug,
  providers,
  countrySlug,
  citySlug,
}: {
  cityName?: string;
  categorySlug?: string | null;
  providers: PublicProviderCard[];
  countrySlug: string;
  citySlug?: string;
}) {
  const top = sortByRating(providers);
  const freelancers = sortByRating(providers.filter((p) => p.business_type === "freelancer"));
  const salons = sortByRating(providers.filter((p) => p.business_type === "salon"));

  const hubBase = `/locations/${countrySlug}`;
  const cityHubHref = citySlug ? `${hubBase}/${citySlug}` : null;

  return (
    <div className="pb-16 md:pb-24">
      <SectionBlock
        title={sectionTopRatedTitle(cityName, categorySlug ?? null)}
        providers={top}
      />
      <SectionBlock title={sectionFreelancersTitle(cityName)} providers={freelancers} />
      <SectionBlock title={sectionSalonsTitle(cityName)} providers={salons} />

      <nav
        className="max-w-[2340px] mx-auto px-4 md:px-8 lg:px-20 mt-10 flex flex-wrap gap-4 text-sm"
        aria-label="Location hub navigation"
      >
        <Link href="/locations" className="text-gray-600 hover:text-[#FF0077] hover:underline">
          All countries
        </Link>
        {cityName ? (
          <Link href={hubBase} className="text-gray-600 hover:text-[#FF0077] hover:underline">
            Country overview
          </Link>
        ) : null}
        {cityHubHref && categorySlug ? (
          <Link href={cityHubHref} className="text-[#FF0077] hover:underline">
            All categories in {cityName}
          </Link>
        ) : null}
        <Link href="/" className="text-gray-600 hover:text-[#FF0077] hover:underline">
          Home
        </Link>
        <Link href="/search" className="text-gray-600 hover:text-[#FF0077] hover:underline">
          Search
        </Link>
      </nav>
    </div>
  );
}

/** Compact hero for location pages (visible H1 + intro) */
export function LocationHubHero({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <header className="border-b border-gray-100 bg-white">
      <div className="max-w-[2340px] mx-auto px-4 md:px-8 lg:px-20 py-6 md:py-10">
        <div className="flex items-start gap-3">
          <MapPin className="h-7 w-7 md:h-9 md:w-9 text-[#FF0077] shrink-0 mt-1" aria-hidden />
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold text-gray-900 tracking-tight">{title}</h1>
            <p className="mt-2 text-gray-600 max-w-3xl text-sm md:text-base leading-relaxed">{description}</p>
          </div>
        </div>
      </div>
    </header>
  );
}
