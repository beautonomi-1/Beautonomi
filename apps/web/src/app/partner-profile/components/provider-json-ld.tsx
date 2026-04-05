import type { PublicProviderDetail } from "@/types/beautonomi";

interface ProviderJsonLdProps {
  provider: PublicProviderDetail;
  origin: string;
  slug: string;
}

export default function ProviderJsonLd({ provider, origin, slug }: ProviderJsonLdProps) {
  const profileUrl = `${origin}/partner-profile?slug=${encodeURIComponent(slug)}`;

  const toAbsolute = (url: string) => {
    if (url.startsWith("http://") || url.startsWith("https://")) return url;
    if (url.startsWith("/")) return `${origin}${url}`;
    return url;
  };

  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: provider.business_name || "Provider",
    url: profileUrl,
    description: provider.description || undefined,
    image: provider.thumbnail_url ? toAbsolute(provider.thumbnail_url) : undefined,
  };

  if (provider.avatar_url) {
    schema.logo = toAbsolute(provider.avatar_url);
  }

  if (provider.rating != null) {
    schema.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: provider.rating,
      reviewCount: provider.review_count ?? 0,
    };
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
