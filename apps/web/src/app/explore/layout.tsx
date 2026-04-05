import type { Metadata } from "next";
import { getHreflangAlternateUrls } from "@/lib/seo/host-config";
import ExploreShell from "./ExploreShell";

export const metadata: Metadata = {
  title: "Explore",
  description: "Discover posts and inspiration from the Beautonomi community.",
  alternates: {
    canonical: "/explore",
    languages: getHreflangAlternateUrls("/explore"),
  },
};

export default function ExploreLayout({ children }: { children: React.ReactNode }) {
  return <ExploreShell>{children}</ExploreShell>;
}
