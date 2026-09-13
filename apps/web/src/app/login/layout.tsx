import type { Metadata } from "next";
import { staticPageMetadata } from "@/lib/i18n/static-page-metadata";

export async function generateMetadata(): Promise<Metadata> {
  return staticPageMetadata({
    path: "/login",
    titleKey: "web.seo.loginTitle",
    descriptionKey: "web.seo.loginDescription",
  });
}

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
