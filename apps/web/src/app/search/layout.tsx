import type { Metadata } from "next";
import { staticPageMetadata } from "@/lib/i18n/static-page-metadata";

export async function generateMetadata(): Promise<Metadata> {
  return staticPageMetadata({
    path: "/search",
    titleKey: "web.seo.searchTitle",
    descriptionKey: "web.seo.searchDescription",
  });
}

export default function SearchLayout({ children }: { children: React.ReactNode }) {
  return children;
}
