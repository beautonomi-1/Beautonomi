import type { Metadata } from "next";
import "./globals.css";
// Country restriction modal removed - not needed
import { AuthProvider } from "@/providers/AuthProvider";
import { PlatformSettingsProvider } from "@/providers/PlatformSettingsProvider";
import AccountStatusGuard from "@/components/auth/AccountStatusGuard";
import { Toaster } from "sonner";
import SuppressConsoleWarnings from "@/components/global/suppress-console-warnings";
import OneSignalProvider from "@/components/global/OneSignalProvider";
import AmplitudeProviderWrapper from "@/components/analytics/AmplitudeProvider";
import SessionTracker from "@/components/analytics/SessionTracker";
import DynamicBranding from "@/components/platform/DynamicBranding";
import { ImpersonationBanner } from "@/components/admin/ImpersonationBanner";
import { OrganizationSchema } from "@/components/seo/structured-data";
import FaviconSpinner from "@/components/global/favicon-spinner";
import AuthLoadingSpinner from "@/components/global/auth-loading-spinner";
import I18nInit from "@/components/i18n/I18nInit";
import { ConfigBundleProvider } from "@/providers/ConfigBundleProvider";

export const metadata: Metadata = {
  title: {
    default: "Beautonomi - Beauty Service Marketplace",
    template: "%s | Beautonomi",
  },
  description: "Discover and book beauty services from verified providers across Africa. Find top-rated salons, spas, barbershops, and beauty professionals near you.",
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
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://beautonomi.com"),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="overflow-x-hidden max-w-full">
      <body className="font-beautonomi overflow-x-hidden max-w-full" suppressHydrationWarning>
        <OrganizationSchema />
        <SuppressConsoleWarnings />
        <AuthProvider>
            <I18nInit />
          <AuthLoadingSpinner />
          <PlatformSettingsProvider>
            <ConfigBundleProvider platform="web" environment={process.env.NODE_ENV === "development" ? "development" : "production"}>
              <FaviconSpinner />
              <DynamicBranding />
              <OneSignalProvider />
              <AmplitudeProviderWrapper>
                <SessionTracker />
                <ImpersonationBanner />
                <AccountStatusGuard>
                  {children}
                </AccountStatusGuard>
                <Toaster position="top-center" />
              </AmplitudeProviderWrapper>
            </ConfigBundleProvider>
          </PlatformSettingsProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
