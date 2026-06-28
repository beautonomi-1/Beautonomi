"use client";

import Banner from "./components/banner";
import FeatureCards from "./components/feature-cards";
import PickingDesigns from "./components/picking-design";
import HowItWorks from "./components/how-it-works";
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
    <div className="bg-white">
      <Navbar4 />
      <GiftsHero content={content} giftCardsEnabled={giftCardsEnabled} />
      <PickingDesigns content={content} />
      <HowItWorks content={content} />
      <FeatureCards content={content} />
      <Banner content={content} />
      <div className="pb-16 md:pb-24">
        <FAQ applyBgPrimary={false} category="gift-card" />
      </div>
    </div>
  );
}
