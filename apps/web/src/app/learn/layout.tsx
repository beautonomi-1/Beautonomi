import type { Metadata } from "next";
import type { ReactNode } from "react";
import LearnLayoutClient from "./learn-layout-client";
import { getLearnSidebarPayload } from "@/lib/learn/public-queries";
import { getHreflangAlternateUrls } from "@/lib/seo/host-config";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Learning Center",
  description: "Guides and answers for customers and beauty professionals on Beautonomi.",
  alternates: {
    canonical: "/learn",
    languages: getHreflangAlternateUrls("/learn"),
  },
  // Help / learning hub is for signed-in discovery and support — not branded SEO landing pages.
  robots: { index: false, follow: true, googleBot: { index: false, follow: true } },
};

export default async function LearnLayout({ children }: { children: ReactNode }) {
  const { tree, categories } = await getLearnSidebarPayload();
  return (
    <LearnLayoutClient initialTree={tree} initialCategories={categories}>
      {children}
    </LearnLayoutClient>
  );
}
