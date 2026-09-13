import type { Metadata } from "next";
import { staticPageMetadata } from "@/lib/i18n/static-page-metadata";

export async function generateMetadata(): Promise<Metadata> {
  return staticPageMetadata({
    path: "/privacy-policy",
    titleKey: "web.seo.privacyTitle",
    descriptionKey: "web.seo.privacyDescription",
  });
}

export default function PrivacyPolicyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
