export function OrganizationSchema() {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://beautonomi.com";
  
  const organizationSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Beautonomi",
    description: "Beauty Service Marketplace connecting customers with verified beauty professionals",
    url: baseUrl,
    logo: `${baseUrl}/logo.svg`,
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

export function BreadcrumbSchema({ items }: { items: Array<{ name: string; url: string }> }) {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://beautonomi.com";
  
  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: `${baseUrl}${item.url}`,
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
  currency = "ZAR"
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
