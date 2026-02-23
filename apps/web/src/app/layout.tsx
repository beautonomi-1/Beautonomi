import type { Metadata } from "next";
import "./globals.css";
// Country restriction modal removed - not needed
import SuppressConsoleWarningsWrapper from "@/components/global/suppress-console-warnings-wrapper";
import { OrganizationSchema } from "@/components/seo/structured-data";
import { RootErrorBoundary } from "@/components/global/RootErrorBoundary";
import GlobalErrorLogger from "@/components/global/GlobalErrorLogger";
import ClientAppShellLoader from "@/components/global/ClientAppShellLoader";

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
        <GlobalErrorLogger />
        <SuppressConsoleWarningsWrapper />
        <RootErrorBoundary>
          <ClientAppShellLoader>{children}</ClientAppShellLoader>
        </RootErrorBoundary>
      </body>
    </html>
  );
}
