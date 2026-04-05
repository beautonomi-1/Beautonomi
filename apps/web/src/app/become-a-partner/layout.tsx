import type { Metadata } from "next";
import { getHreflangAlternateUrls } from "@/lib/seo/host-config";

export const metadata: Metadata = {
  title: "Become a partner",
  description:
    "Grow your beauty business with Beautonomi — booking, payments, and tools built for mobile pros.",
  alternates: {
    canonical: "/become-a-partner",
    languages: getHreflangAlternateUrls("/become-a-partner"),
  },
};

export default function BecomeAPartnerLayout({ children }: { children: React.ReactNode }) {
  return children;
}
