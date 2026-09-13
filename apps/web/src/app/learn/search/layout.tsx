import type { Metadata } from "next";
import { staticPageMetadata } from "@/lib/i18n/static-page-metadata";
import type { ReactNode } from "react";
import { hreflangForPath } from "@/lib/seo/metadata-hreflang";

export async function generateMetadata(): Promise<Metadata> {
  return staticPageMetadata({
    path: "/learn/search",
    titleKey: "web.seo.learnSearchTitle",
    descriptionKey: "web.seo.learnSearchDescription",
    robots: { index: false, follow: true, googleBot: { index: false, follow: true } },
  });
}

export default function LearnSearchLayout({ children }: { children: ReactNode }) {
  return children;
}
