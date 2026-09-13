import type { Metadata } from "next";
import { staticPageMetadata } from "@/lib/i18n/static-page-metadata";
import { getPublicPageContent } from "@/lib/content/getPublicPageContent";
import GiftCardPageClient from "./gift-card-page-client";

export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  return staticPageMetadata({
    path: "/gift-card",
    titleKey: "web.seo.giftCardTitle",
    descriptionKey: "web.seo.giftCardDescription",
  });
}

export default async function Page() {
  const content = await getPublicPageContent("gift-card");
  return <GiftCardPageClient content={content} />;
}
