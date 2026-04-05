import type { Metadata } from "next";
import { getHreflangAlternateUrls } from "@/lib/seo/host-config";

export const metadata: Metadata = {
  title: "Terms and Conditions",
  description: "Read Beautonomi's terms and conditions for using the platform.",
  alternates: {
    canonical: "/terms-and-condition",
    languages: getHreflangAlternateUrls("/terms-and-condition"),
  },
};

export default function TermsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
