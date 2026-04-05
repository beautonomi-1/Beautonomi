import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";

export function OrganizationSchema({ baseUrl }: { baseUrl: string }) {
  const origin = baseUrl.replace(/\/$/, "");

  const organizationSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Beautonomi",
    description: "Beauty Service Marketplace connecting customers with verified beauty professionals",
    url: origin,
    logo: `${origin}/images/logo.svg`,
    sameAs: [
      // Add your social media URLs here when available
      // "https://www.facebook.com/beautonomi",
      // "https://www.instagram.com/beautonomi",
      // "https://twitter.com/beautonomi",
    ],
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "Customer Service",
      // Add your contact email when available
      // email: "support@beautonomi.com",
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(organizationSchema),
      }}
    />
  );
}

export function BreadcrumbSchema({
  baseUrl,
  items,
}: {
  baseUrl: string;
  items: Array<{ name: string; url: string }>;
}) {
  const origin = baseUrl.replace(/\/$/, "");

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url.startsWith("http") ? item.url : `${origin}${item.url.startsWith("/") ? "" : "/"}${item.url}`,
    })),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(breadcrumbSchema),
      }}
    />
  );
}

export function ServiceSchema({ 
  name, 
  description, 
  provider, 
  price,
  currency = LAST_RESORT_CURRENCY
}: {
  name: string;
  description: string;
  provider: string;
  price?: number;
  currency?: string;
}) {
  const _baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://beautonomi.com";
  
  const serviceSchema = {
    "@context": "https://schema.org",
    "@type": "Service",
    name,
    description,
    provider: {
      "@type": "LocalBusiness",
      name: provider,
    },
    ...(price && {
      offers: {
        "@type": "Offer",
        price,
        priceCurrency: currency,
      },
    }),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(serviceSchema),
      }}
    />
  );
}
