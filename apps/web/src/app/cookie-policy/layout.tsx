import type { Metadata } from "next";
import { staticPageMetadata } from "@/lib/i18n/static-page-metadata";

export async function generateMetadata(): Promise<Metadata> {
  return staticPageMetadata({
    path: "/cookie-policy",
    titleKey: "web.seo.cookiePolicyTitle",
    descriptionKey: "web.seo.cookiePolicyDescription",
    robots: { index: false, follow: true, nocache: true, googleBot: { index: false, follow: true, noimageindex: true } },
  });
}

export default function CookiePolicyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
