import type { Metadata } from "next";
import { staticPageMetadata } from "@/lib/i18n/static-page-metadata";

export async function generateMetadata(): Promise<Metadata> {
  return staticPageMetadata({
    path: "/signup",
    titleKey: "web.seo.signupTitle",
    descriptionKey: "web.seo.signupDescription",
  });
}

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return children;
}
