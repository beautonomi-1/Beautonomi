import React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import PlatformLogo from "@/components/platform/PlatformLogo";
import { PortalErrorBoundary } from "./components/portal-error-boundary";
import { staticPageMetadata } from "@/lib/i18n/static-page-metadata";

export async function generateMetadata(): Promise<Metadata> {
  return staticPageMetadata({
    path: "/portal",
    titleKey: "web.seo.portalTitle",
    descriptionKey: "web.seo.portalDescription",
    robots: "noindex, nofollow",
  });
}

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PortalErrorBoundary>
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="sticky top-0 z-10 bg-white border-b border-gray-100 shrink-0 print:hidden">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 text-sm text-gray-600 hover:text-[#FF0077] transition-colors"
          >
            <PlatformLogo alt="Beautonomi" className="h-8 w-auto" />
          </Link>
          <Link
            href="/"
            className="text-sm text-gray-500 hover:text-[#FF0077] transition-colors"
          >
            Back to Beautonomi
          </Link>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
    </PortalErrorBoundary>
  );
}
