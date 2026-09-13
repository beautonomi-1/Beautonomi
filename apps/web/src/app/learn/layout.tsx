import type { Metadata } from "next";
import { staticPageMetadata } from "@/lib/i18n/static-page-metadata";
import type { ReactNode } from "react";
import LearnLayoutClient from "./learn-layout-client";
import { getLearnSidebarPayload } from "@/lib/learn/public-queries";
export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  return staticPageMetadata({
    path: "/learn",
    titleKey: "web.seo.learnTitle",
    descriptionKey: "web.seo.learnDescription",
    robots: { index: false, follow: true, googleBot: { index: false, follow: true } },
  });
}

export default async function LearnLayout({ children }: { children: ReactNode }) {
  const { tree, categories } = await getLearnSidebarPayload();
  return (
    <LearnLayoutClient initialTree={tree} initialCategories={categories}>
      {children}
    </LearnLayoutClient>
  );
}
