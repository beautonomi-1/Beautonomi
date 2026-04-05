import type { Metadata } from "next";
import { getHreflangAlternateUrls } from "@/lib/seo/host-config";

export const metadata: Metadata = {
  title: "About",
  description: "Learn about Beautonomi, our mission, and how we support beauty professionals and clients.",
  alternates: {
    canonical: "/about",
    languages: getHreflangAlternateUrls("/about"),
  },
};

export default function AboutLayout({ children }: { children: React.ReactNode }) {
  return children;
}
