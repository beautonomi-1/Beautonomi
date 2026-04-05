"use client";

import Banner from "./components/banner";
import FeatureCards from "./components/feature-cards";
import PickingDesigns from "./components/picking-design";
import FAQ from "@/components/global/faq";
import GiftsHero from "./components/gifts-hero";
import Navbar4 from "@/components/global/Navbar4";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import type { PublicPageContent } from "@/lib/content/getPublicPageContent";

interface GiftCardPageClientProps {
  content: PublicPageContent | null;
}

export default function GiftCardPageClient({ content }: GiftCardPageClientProps) {
  const { enabled: giftCardsEnabled } = useFeatureFlag("gift_cards");

  return (
    <div>
      <Navbar4 />
      <GiftsHero content={content} giftCardsEnabled={giftCardsEnabled} />
      <PickingDesigns content={content} />
      <FeatureCards content={content} />
      <Banner content={content} />
      <FAQ applyBgPrimary={false} />
    </div>
  );
}
