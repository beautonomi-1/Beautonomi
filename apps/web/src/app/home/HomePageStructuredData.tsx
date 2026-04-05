import "server-only";

import type { HomePageInitialData } from "@/app/home/home-initial-types";
import { getPublicSiteOriginFromHeaders } from "@/lib/seo/public-site-origin";
import type { PublicProviderCard } from "@/types/beautonomi";

function partnerUrl(origin: string, p: PublicProviderCard): string {
  const u = new URL("/partner-profile", origin);
  u.searchParams.set("slug", p.slug);
  return u.toString();
}

/**
 * WebSite + SearchAction (site search) and ItemList (top-rated carousel) for the home page.
 */
export async function HomePageStructuredData({
  homeData,
}: {
  homeData: HomePageInitialData | null;
}) {
  const origin = (await getPublicSiteOriginFromHeaders()).replace(/\/$/, "");
  const searchUrlTemplate = `${origin}/search?q={search_term_string}`;

  const websiteSchema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Beautonomi",
    url: `${origin}/`,
    description:
      "Discover and book beauty services from verified providers across Africa.",
    potentialAction: {
      "@type": "SearchAction",
      target: searchUrlTemplate,
      "query-input": "required name=search_term_string",
    },
  };

  const topRated = homeData?.topRated?.slice(0, 8) ?? [];
  const itemListSchema =
    topRated.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: "Top rated beauty professionals",
          numberOfItems: topRated.length,
          itemListElement: topRated.map((p, i) => ({
            "@type": "ListItem",
            position: i + 1,
            item: partnerUrl(origin, p),
            name: p.business_name,
          })),
        }
      : null;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }}
      />
      {itemListSchema ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListSchema) }}
        />
      ) : null}
    </>
  );
}
