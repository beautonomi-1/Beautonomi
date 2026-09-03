import type { Metadata } from "next";
import { getHreflangAlternateUrls } from "@/lib/seo/host-config";

export const metadata: Metadata = {
  title: "Partner sign up",
  description: "Create your Beautonomi provider account.",
  alternates: {
    canonical: "/provider/signup",
    languages: getHreflangAlternateUrls("/provider/signup"),
  },
};

export default function ProviderSignupLayout({ children }: { children: React.ReactNode }) {
  return children;
}
