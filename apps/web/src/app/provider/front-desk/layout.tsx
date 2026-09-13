import type { Metadata } from "next";
import { staticPageMetadata } from "@/lib/i18n/static-page-metadata";

export async function generateMetadata(): Promise<Metadata> {
  return staticPageMetadata({
    path: "/provider/front-desk",
    titleKey: "web.seo.frontDeskTitle",
    descriptionKey: "web.seo.frontDeskDescription",
    robots: "noindex, nofollow",
  });
}

export default function FrontDeskLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
