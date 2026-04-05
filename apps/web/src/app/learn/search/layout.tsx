import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getHreflangAlternateUrls } from "@/lib/seo/host-config";

export const metadata: Metadata = {
  title: "Search",
  description: "Search articles in the Beautonomi Learning Center.",
  alternates: {
    canonical: "/learn/search",
    languages: getHreflangAlternateUrls("/learn/search"),
  },
};

export default function LearnSearchLayout({ children }: { children: ReactNode }) {
  return children;
}
