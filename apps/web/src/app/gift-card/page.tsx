import type { Metadata } from "next";
import { getPublicPageContent } from "@/lib/content/getPublicPageContent";
import GiftCardPageClient from "./gift-card-page-client";
import { getHreflangAlternateUrls } from "@/lib/seo/host-config";

export const metadata: Metadata = {
  title: "Gift Cards",
  description:
    "Send a Beautonomi gift card in minutes. Beautiful designs, a personal message, and credit that never expires — redeemable on any beauty and wellness service.",
  alternates: {
    canonical: "/gift-card",
    languages: getHreflangAlternateUrls("/gift-card"),
  },
};

export const revalidate = 300;

export default async function Page() {
  const content = await getPublicPageContent("gift-card");
  return <GiftCardPageClient content={content} />;
}
