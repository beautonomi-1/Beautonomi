import type { Metadata } from "next";
import { getHreflangAlternateUrls } from "@/lib/seo/host-config";

export const metadata: Metadata = {
  title: "Pricing",
  description: "View Beautonomi pricing plans for beauty professionals and businesses.",
  alternates: {
    canonical: "/pricing",
    languages: getHreflangAlternateUrls("/pricing"),
  },
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
