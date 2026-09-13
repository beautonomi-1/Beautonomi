import type { Metadata } from "next";
import { staticPageMetadata } from "@/lib/i18n/static-page-metadata";
import ExploreShell from "./ExploreShell";

export async function generateMetadata(): Promise<Metadata> {
  return staticPageMetadata({
    path: "/explore",
    titleKey: "web.seo.exploreTitle",
    descriptionKey: "web.seo.exploreDescription",
  });
}

export default function ExploreLayout({ children }: { children: React.ReactNode }) {
  return <ExploreShell>{children}</ExploreShell>;
}
