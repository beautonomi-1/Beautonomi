import type { Metadata } from "next";
import { getHreflangAlternateUrls } from "@/lib/seo/host-config";

export const metadata: Metadata = {
  title: "Search",
  description: "Search for beauty services and providers on Beautonomi.",
  alternates: {
    canonical: "/search",
    languages: getHreflangAlternateUrls("/search"),
  },
};

export default function SearchLayout({ children }: { children: React.ReactNode }) {
  return children;
}
