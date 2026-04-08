import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";
// Country restriction modal removed - not needed
import SuppressConsoleWarningsWrapper from "@/components/global/suppress-console-warnings-wrapper";
import { OrganizationSchema } from "@/components/seo/structured-data";
import { RootErrorBoundary } from "@/components/global/RootErrorBoundary";
import GlobalErrorLogger from "@/components/global/GlobalErrorLogger";
import ClientAppShellLoader from "@/components/global/ClientAppShellLoader";
import { getOsTypeFromUserAgent } from "@/lib/utils/os-type";
import {
  getPublicSiteOriginFromHeaders,
  openGraphLocaleForHost,
} from "@/lib/seo/public-site-origin";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { getTenantLocaleTagFromRegionConfig } from "@/lib/locale/tenant-locale";
import { getTenantRegionConfig } from "@/lib/regions/config";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  /** Chrome/Android virtual keyboard: resize layout so fixed footers stay usable */
  interactiveWidget: "resizes-content",
};

export async function generateMetadata(): Promise<Metadata> {
  const h = await headers();
  const hostRaw =
    (h.get("x-forwarded-host") || h.get("host") || "").split(":")[0] || "";
  const metadataBaseUrl = await getPublicSiteOriginFromHeaders();
  const ogLocale = openGraphLocaleForHost(hostRaw);

  return {
    /** Same mark as navbar (`/images/logo.svg`); App Router also serves `src/app/icon.svg` at `/icon.svg`. */
    icons: {
      icon: [{ url: "/icon.svg", type: "image/svg+xml", sizes: "any" }],
      shortcut: "/icon.svg",
      apple: [{ url: "/icon.svg", type: "image/svg+xml" }],
    },
    title: {
      default: "Beautonomi - Beauty Service Marketplace",
      template: "%s | Beautonomi",
    },
    description:
      "Discover and book beauty services from verified providers across Africa. Find top-rated salons, spas, barbershops, and beauty professionals near you.",
    keywords: [
      "beauty services",
      "salon booking",
      "spa booking",
      "beauty marketplace",
      "hair salon",
      "nail salon",
      "massage therapy",
      "barbershop",
      "beauty professionals",
      "book beauty services online",
    ],
    authors: [{ name: "Beautonomi" }],
    creator: "Beautonomi",
    publisher: "Beautonomi",
    metadataBase: new URL(metadataBaseUrl),
    openGraph: {
      type: "website",
      locale: ogLocale,
      url: "/",
      siteName: "Beautonomi",
      title: "Beautonomi - Beauty Service Marketplace",
      description: "Discover and book beauty services from verified providers across Africa",
      images: [
        {
          url: "/og-image.jpg",
          width: 1200,
          height: 630,
          alt: "Beautonomi - Beauty Service Marketplace",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "Beautonomi - Beauty Service Marketplace",
      description: "Discover and book beauty services from verified providers",
      images: ["/twitter-image.jpg"],
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-video-preview": -1,
        "max-image-preview": "large",
        "max-snippet": -1,
      },
    },
    ...(process.env.NEXT_PUBLIC_GOOGLE_VERIFICATION && {
      verification: {
        google: process.env.NEXT_PUBLIC_GOOGLE_VERIFICATION,
      },
    }),
  };
}

/** Resolve BCP-47 lang tag from the tenant's configured locale (e.g. "en-ZA", "zu-ZA"). */
async function resolveTenantLang(headersList: Awaited<ReturnType<typeof headers>>): Promise<string> {
  try {
    const req = new Request("https://placeholder", {
      headers: Object.fromEntries(headersList.entries()),
    });
    const tenantId = await resolveTenantIdWithZaFallback(req);
    const regionConfig = await getTenantRegionConfig(tenantId);
    const tag = getTenantLocaleTagFromRegionConfig(regionConfig);
    // Return just the primary language subtag (e.g. "en" from "en-ZA")
    return tag ? tag.split("-")[0] : "en";
  } catch {
    return "en";
  }
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const headersList = await headers();
  const ua = headersList.get("user-agent") ?? "";
  const osType = getOsTypeFromUserAgent(ua);
  const organizationBaseUrl = await getPublicSiteOriginFromHeaders();
  const lang = await resolveTenantLang(headersList);

  return (
    <html lang={lang} className="overflow-x-hidden max-w-full">
      <body className="font-beautonomi overflow-x-hidden max-w-full" suppressHydrationWarning>
        <OrganizationSchema baseUrl={organizationBaseUrl} />
        <GlobalErrorLogger />
        {process.env.NODE_ENV !== "production" ? (
          <SuppressConsoleWarningsWrapper />
        ) : null}
        <RootErrorBoundary>
          <ClientAppShellLoader osType={osType}>{children}</ClientAppShellLoader>
        </RootErrorBoundary>
      </body>
    </html>
  );
}
