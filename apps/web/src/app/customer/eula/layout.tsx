import type { Metadata } from "next";
import { staticPageMetadata } from "@/lib/i18n/static-page-metadata";

export async function generateMetadata(): Promise<Metadata> {
  return staticPageMetadata({
    path: "/customer/eula",
    titleKey: "web.seo.customerEulaTitle",
    descriptionKey: "web.seo.customerEulaDescription",
  });
}

export default function CustomerEulaLayout({ children }: { children: React.ReactNode }) {
  return children;
}
