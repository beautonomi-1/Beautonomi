import type { Metadata } from "next";
import { getHreflangAlternateUrls } from "@/lib/seo/host-config";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "Read Beautonomi's Privacy Policy and how we handle your data.",
  alternates: {
    canonical: "/privacy-policy",
    languages: getHreflangAlternateUrls("/privacy-policy"),
  },
};

export default function PrivacyPolicyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
