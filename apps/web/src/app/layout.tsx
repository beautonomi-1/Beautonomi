import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";
// Country restriction modal removed - not needed
import SuppressConsoleWarningsWrapper from "@/components/global/suppress-console-warnings-wrapper";
import { OrganizationSchema, WebSiteSchema } from "@/components/seo/structured-data";
import { RootErrorBoundary } from "@/components/global/RootErrorBoundary";
import GlobalErrorLogger from "@/components/global/GlobalErrorLogger";
import ClientAppShellLoader from "@/components/global/ClientAppShellLoader";
import { CspNonceProvider } from "@/providers/CspNonceProvider";
import { CSP_NONCE_HEADER } from "@/lib/security/csp-nonce";
import { getOsTypeFromUserAgent } from "@/lib/utils/os-type";
import {
  getPublicSiteOriginFromHeaders,
  openGraphLocaleForHost,
} from "@/lib/seo/public-site-origin";
import { buildHreflangAlternates } from "@/lib/seo/hreflang-from-languages";
import { getServerT } from "@/lib/i18n/server";
import { resolveRequestLanguage, type RequestLanguageContext } from "@/lib/locale/resolve-request-language";

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

  const localeCtx = await resolveRequestLanguage();
  const t = await getServerT(localeCtx.language);
  const defaultTitle = t("web.seo.defaultTitle") as string;
  const defaultDescription = t("web.seo.defaultDescription") as string;
  const hreflang = buildHreflangAlternates("/", {
    supportedLanguages: localeCtx.marketSupportedLanguages,
    regionCode: localeCtx.regionCode,
  });

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
      default: defaultTitle,
      template: `%s | ${t("web.seo.siteName")}`,
    },
    description: defaultDescription,
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
      languages: hreflang,
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
      title: defaultTitle,
      description: defaultDescription,
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
      title: defaultTitle,
      description: defaultDescription,
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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const headersList = await headers();
  const ua = headersList.get("user-agent") ?? "";
  const osType = getOsTypeFromUserAgent(ua);
  const organizationBaseUrl = await getPublicSiteOriginFromHeaders();
  const locale = await resolveRequestLanguage();
  const supabaseStorageOrigin = getSupabaseStorageOrigin();
  const cspNonce = headersList.get(CSP_NONCE_HEADER) ?? undefined;

  return (
    <html lang={locale.language} dir={locale.dir} className="overflow-x-hidden max-w-full">
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
        <OrganizationSchema baseUrl={organizationBaseUrl} nonce={cspNonce} />
        <WebSiteSchema baseUrl={organizationBaseUrl} nonce={cspNonce} />
        <GlobalErrorLogger />
        {process.env.NODE_ENV !== "production" ? (
          <SuppressConsoleWarningsWrapper />
        ) : null}
        <RootErrorBoundary>
          <CspNonceProvider nonce={cspNonce}>
            <ClientAppShellLoader osType={osType} locale={locale}>
              {children}
            </ClientAppShellLoader>
          </CspNonceProvider>
        </RootErrorBoundary>
      </body>
    </html>
  );
}
