import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";
// Country restriction modal removed - not needed
import SuppressConsoleWarningsWrapper from "@/components/global/suppress-console-warnings-wrapper";
import { OrganizationSchema, WebSiteSchema } from "@/components/seo/structured-data";
import { RootErrorBoundary } from "@/components/global/RootErrorBoundary";
import GlobalErrorLogger from "@/components/global/GlobalErrorLogger";
import ClientAppShellLoader from "@/components/global/ClientAppShellLoader";
import { getOsTypeFromUserAgent } from "@/lib/utils/os-type";
import {
  getPublicSiteOriginFromHeaders,
  openGraphLocaleForHost,
} from "@/lib/seo/public-site-origin";
import { getHreflangAlternateUrls } from "@/lib/seo/host-config";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { getTenantLocaleTagFromRegionConfig } from "@/lib/locale/tenant-locale";
import { getTenantRegionConfig } from "@/lib/regions/config";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "light",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#111827" },
  ],
  viewportFit: "cover",
  /** Chrome/Android virtual keyboard: resize layout so fixed footers stay usable */
  interactiveWidget: "resizes-content",
};

function getSupabaseStorageOrigin(): string | null {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw?.startsWith("https://")) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const h = await headers();
  const hostRaw =
    (h.get("x-forwarded-host") || h.get("host") || "").split(":")[0] || "";
  const metadataBaseUrl = await getPublicSiteOriginFromHeaders();
  const ogLocale = openGraphLocaleForHost(hostRaw);
  const verification: Metadata["verification"] = {
    ...(process.env.NEXT_PUBLIC_GOOGLE_VERIFICATION
      ? { google: process.env.NEXT_PUBLIC_GOOGLE_VERIFICATION }
      : {}),
    ...(process.env.NEXT_PUBLIC_BING_VERIFICATION
      ? { other: { "msvalidate.01": process.env.NEXT_PUBLIC_BING_VERIFICATION } }
      : {}),
  };
  const hasVerification = Boolean(
    process.env.NEXT_PUBLIC_GOOGLE_VERIFICATION || process.env.NEXT_PUBLIC_BING_VERIFICATION,
  );

  return {
    /** Same mark as navbar (`/images/logo.svg`); App Router also serves `src/app/icon.svg` at `/icon.svg`. */
    icons: {
      icon: [{ url: "/icon.svg", type: "image/svg+xml", sizes: "any" }],
      shortcut: "/icon.svg",
      apple: [{ url: "/icon.svg", type: "image/svg+xml" }],
    },
    // NOTE: `manifest` is NOT set here — we emit the `<link rel="manifest" ... crossOrigin="use-credentials">`
    // tag manually in <head> below so Vercel Preview Protection (which gates
    // every preview URL behind an SSO challenge) lets the browser send its
    // auth cookie with the manifest request. Without `use-credentials`, the
    // browser strips cookies on the manifest fetch and the request 401s. The
    // real file is served by `src/app/manifest.ts` (a metadata route).
    title: {
      default: "Beautonomi | Book Beauty Services, Salons & Mobile Pros",
      template: "%s | Beautonomi",
    },
    description:
      "Book trusted beauty services near you. Compare verified salons, spas, barbers, nail techs, makeup artists, and mobile beauty professionals on Beautonomi.",
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
    alternates: {
      canonical: metadataBaseUrl,
      languages: getHreflangAlternateUrls("/"),
    },
    appleWebApp: {
      capable: true,
      title: "Beautonomi",
      statusBarStyle: "default",
    },
    formatDetection: {
      telephone: false,
      address: false,
      email: false,
    },
    category: "beauty",
    openGraph: {
      type: "website",
      locale: ogLocale,
      url: "/",
      siteName: "Beautonomi",
      title: "Beautonomi | Book Beauty Services, Salons & Mobile Pros",
      description: "Find and book verified salons, spas, barbers, nail techs, makeup artists, and mobile beauty professionals near you.",
      images: [
        {
          url: "/og-image.jpg",
          width: 1200,
          height: 630,
          alt: "Beautonomi - Book Beauty Services",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "Beautonomi | Book Beauty Services, Salons & Mobile Pros",
      description: "Find and book verified salons, spas, barbers, nail techs, makeup artists, and mobile beauty professionals near you.",
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
    ...(hasVerification ? { verification } : {}),
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
  const supabaseStorageOrigin = getSupabaseStorageOrigin();

  return (
    <html lang={lang} className="overflow-x-hidden max-w-full">
      <head>
        {/**
         * §Provider-launch (2026-05): emit the PWA manifest link manually so
         * `crossOrigin="use-credentials"` is set. Required for Vercel preview
         * deployments to attach the SSO cookie on the manifest fetch and
         * avoid the noisy `manifest.webmanifest 401 (Unauthorized)` console
         * spam reported by providers testing on `*-git-develop-*.vercel.app`.
         */}
        <link rel="manifest" href="/manifest.webmanifest" crossOrigin="use-credentials" />
        {supabaseStorageOrigin ? (
          <>
            <link rel="preconnect" href={supabaseStorageOrigin} crossOrigin="anonymous" />
            <link rel="dns-prefetch" href={supabaseStorageOrigin} />
          </>
        ) : null}
      </head>
      <body className="font-beautonomi overflow-x-hidden max-w-full" suppressHydrationWarning>
        <OrganizationSchema baseUrl={organizationBaseUrl} />
        <WebSiteSchema baseUrl={organizationBaseUrl} />
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
