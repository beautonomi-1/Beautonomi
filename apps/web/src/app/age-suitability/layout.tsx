import type { Metadata } from "next";
import { staticPageMetadata } from "@/lib/i18n/static-page-metadata";

export async function generateMetadata(): Promise<Metadata> {
  return staticPageMetadata({
    path: "/age-suitability",
    titleKey: "web.seo.ageSuitabilityTitle",
    descriptionKey: "web.seo.ageSuitabilityDescription",
    robots: { index: false, follow: true, nocache: true, googleBot: { index: false, follow: true, noimageindex: true } },
  });
}

export default function AgeSuitabilityLayout({ children }: { children: React.ReactNode }) {
  return children;
}
