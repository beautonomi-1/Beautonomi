import type { Metadata } from "next";
import { staticPageMetadata } from "@/lib/i18n/static-page-metadata";

export async function generateMetadata(): Promise<Metadata> {
  return staticPageMetadata({
    path: "/provider/signup",
    titleKey: "web.seo.providerSignupTitle",
    descriptionKey: "web.seo.providerSignupDescription",
  });
}

export default function ProviderSignupLayout({ children }: { children: React.ReactNode }) {
  return children;
}
