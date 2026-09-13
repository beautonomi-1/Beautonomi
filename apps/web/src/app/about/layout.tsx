import type { Metadata } from "next";
import { staticPageMetadata } from "@/lib/i18n/static-page-metadata";

export async function generateMetadata(): Promise<Metadata> {
  return staticPageMetadata({
    path: "/about",
    titleKey: "web.seo.aboutTitle",
    descriptionKey: "web.seo.aboutDescription",
  });
}

export default function AboutLayout({ children }: { children: React.ReactNode }) {
  return children;
}
