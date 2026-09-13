import type { Metadata } from "next";
import { staticPageMetadata } from "@/lib/i18n/static-page-metadata";

export async function generateMetadata(): Promise<Metadata> {
  return staticPageMetadata({
    path: "/provider/eula",
    titleKey: "web.seo.providerEulaTitle",
    descriptionKey: "web.seo.providerEulaDescription",
  });
}

export default function PartnerEulaLayout({ children }: { children: React.ReactNode }) {
  return children;
}
