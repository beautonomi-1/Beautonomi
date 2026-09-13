import type { Metadata } from "next";
import { staticPageMetadata } from "@/lib/i18n/static-page-metadata";

export async function generateMetadata(): Promise<Metadata> {
  return staticPageMetadata({
    path: "/terms-and-condition",
    titleKey: "web.seo.termsTitle",
    descriptionKey: "web.seo.termsDescription",
  });
}

export default function TermsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
