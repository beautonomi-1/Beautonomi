import type { Metadata } from "next";

/**
 * Generate dynamic metadata for provider profile pages
 * This ensures proper Open Graph tags for social media sharing (WhatsApp, Facebook, Twitter, etc.)
 * 
 * Note: Since the page uses searchParams (?slug=...), we need to handle metadata differently.
 * We'll set default metadata here and the page component will inject meta tags via useEffect if needed.
 */
export async function generateMetadata(): Promise<Metadata> {
  // Default metadata - the actual provider-specific metadata will be set client-side
  // or we can create a dynamic route structure later
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://beautonomi.com";

  return {
    title: "Provider Profile | Beautonomi",
    description: "Discover beauty services from verified providers on Beautonomi",
    openGraph: {
      title: "Provider Profile | Beautonomi",
      description: "Discover beauty services from verified providers on Beautonomi",
      siteName: "Beautonomi",
      images: [
        {
          url: `${siteUrl}/images/logo-beatonomi.svg`,
          width: 1200,
          height: 630,
          alt: "Beautonomi - Beauty Service Marketplace",
        },
      ],
      locale: "en_US",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: "Provider Profile | Beautonomi",
      description: "Discover beauty services from verified providers on Beautonomi",
    },
  };
}

export default function PartnerProfileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
