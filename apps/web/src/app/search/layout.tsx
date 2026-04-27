import type { Metadata } from "next";
import { getHreflangAlternateUrls } from "@/lib/seo/host-config";

export const metadata: Metadata = {
  title: "Search Beauty Services, Salons & Mobile Pros",
  description:
    "Search verified beauty professionals near you. Compare salons, spas, barbers, nail techs, makeup artists, and mobile beauty services on Beautonomi.",
  alternates: {
    canonical: "/search",
    languages: getHreflangAlternateUrls("/search"),
  },
};

export default function SearchLayout({ children }: { children: React.ReactNode }) {
  return children;
}
