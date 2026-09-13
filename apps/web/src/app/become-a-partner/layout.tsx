import type { Metadata } from "next";
import { staticPageMetadata } from "@/lib/i18n/static-page-metadata";

export async function generateMetadata(): Promise<Metadata> {
  return staticPageMetadata({
    path: "/become-a-partner",
    titleKey: "web.seo.becomePartnerTitle",
    descriptionKey: "web.seo.becomePartnerDescription",
  });
}

export default function BecomeAPartnerLayout({ children }: { children: React.ReactNode }) {
  return children;
}
