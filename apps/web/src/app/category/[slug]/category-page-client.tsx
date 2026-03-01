"use client";
import React from "react";
import Link from "next/link";
import PageHeader from "@/components/ui/page-header";
import ProviderCard from "@/app/home/components/provider-card";
import EmptyState from "@/components/ui/empty-state";
import type { Category, PublicProviderCard } from "@/types/beautonomi";

type Props = {
  category: Category;
  initialProviders: any[];
  slug: string;
};

export default function CategoryPageClient({ category, initialProviders, slug }: Props) {
  // Transform providers to match PublicProviderCard type
  const providers: PublicProviderCard[] = initialProviders.map((p) => ({
    id: p.id,
    slug: p.slug,
    business_name: p.business_name,
    business_type: p.business_type || "salon",
    rating: p.rating_average || 0,
    review_count: p.review_count || 0,
    thumbnail_url: p.thumbnail_url,
    avatar_url: p.avatar_url ?? null,
    city: "",
    country: "",
    is_featured: p.is_featured || false,
    is_verified: p.is_verified || false,
    starting_price: undefined,
    currency: p.currency || "ZAR",
    description: null,
    distance_km: null,
    supports_house_calls: false,
    supports_salon: false,
  }));

  return (
    <div className="container mx-auto px-4 py-8">
      <PageHeader
        title={category.name}
        description={category.description || undefined}
      />

      {category.subcategories && category.subcategories.length > 0 && (
        <div className="mb-8">
          <h3 className="text-lg font-semibold mb-4">Subcategories</h3>
          <div className="flex flex-wrap gap-2">
            {category.subcategories.map((subcat) => (
              <Link
                key={subcat.id}
                href={`/search?category=${slug}&subcategory=${subcat.slug}`}
                className="px-4 py-2 bg-gray-100 rounded-full text-sm hover:bg-gray-200 transition-colors"
              >
                {subcat.name}
              </Link>
            ))}
          </div>
        </div>
      )}

      {providers.length === 0 ? (
        <EmptyState
          title="No providers found"
          description={`No providers found in ${category.name}. Try a different category.`}
        />
      ) : (
        <>
          <div className="mb-4 text-sm text-gray-600">
            {providers.length} {providers.length === 1 ? "provider" : "providers"} found
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {providers.map((provider) => (
              <ProviderCard key={provider.id} provider={provider} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
