import type { Metadata } from "next";
import { staticPageMetadata } from "@/lib/i18n/static-page-metadata";

export async function generateMetadata(): Promise<Metadata> {
  return staticPageMetadata({
    path: "/pricing",
    titleKey: "web.seo.pricingTitle",
    descriptionKey: "web.seo.pricingDescription",
  });
}

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
