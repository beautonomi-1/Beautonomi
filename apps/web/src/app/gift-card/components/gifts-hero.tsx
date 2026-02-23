"use client";

import { Button } from "@/components/ui/button";
import React from "react";
import Link from "next/link";

interface PageContent {
  [sectionKey: string]: {
    content: string;
    content_type: string;
    metadata: Record<string, any>;
  };
}

interface GiftsHeroProps {
  content?: PageContent | null;
  giftCardsEnabled?: boolean;
}

const GiftsHero = ({ content, giftCardsEnabled = true }: GiftsHeroProps) => {
  // Get content from CMS or use defaults
  const heroTitle = content?.hero_title?.content || "Beautonomi gift cards";
  const heroSubtitle = content?.hero_subtitle?.content || "You give. They glow.";
  const heroDescription = content?.hero_description?.content || "Bring the world of Beautonomi to friends and family. Celebrate holidays, recognize important moments, and treat them to beauty and wellness services. Perfect for any occasion, since they never expire.";
  const businessText = content?.business_text?.content || "Purchasing for business?";
  const buyNowButtonText = content?.buy_now_button_text?.content || "Buy now";
  const bulkLinkText = content?.bulk_link_text?.content || "Buy gift cards in bulk";
  const purchaseUrl = content?.purchase_url?.content || "/gift-card/purchase";
  const bulkPurchaseUrl = content?.bulk_purchase_url?.content || "/gift-card/purchase?bulk=true";
  
  // Get images from CMS or use gradient placeholder
  const cardBackgroundImage = content?.card_background_image?.content;
  const cardOverlayImage = content?.card_overlay_image?.content;
  const placeholderBrandName = content?.placeholder_brand_name?.content || "Beautonomi";
  const placeholderCardText = content?.placeholder_card_text?.content || "Gift Card";

  return (
    <div className="pb-20 md:pb-24 lg:pb-16">
    <div className="container">
      <div className="mb-14">
        <h2 className="text-[56px] md:text-[100px] lg:text-[128px] font-normal  text-secondary max-w-80 md:max-w-2xl leading-[50px] md:leading-[90px] lg:leading-[130px] mx-auto text-center mb-10 lg:mb-14">
          {heroTitle}
        </h2>
        <div className="text-center mb-14 lg:mb-20">
          {giftCardsEnabled ? (
            <Link href={purchaseUrl}>
              <Button variant="secondary" size="rounded">
                {buyNowButtonText}
              </Button>
            </Link>
          ) : (
            <p className="text-gray-500 text-sm">Gift cards are currently unavailable.</p>
          )}
        </div>
        <div className="relative mx-auto">
          {cardBackgroundImage && cardOverlayImage ? (
            <>
              <img 
                src={cardBackgroundImage} 
                alt="Card Background"  
                className="z-10 w-[900px] h-[650px] mx-auto object-cover rounded-2xl" 
              />
              <img 
                src={cardOverlayImage} 
                alt="Card Overlay"  
                className="absolute inset-0 w-[900px] h-[650px] mx-auto object-cover rounded-2xl" 
              />
            </>
          ) : (
            <div className="w-[900px] h-[650px] mx-auto rounded-2xl bg-gradient-to-br from-[#FF0077] via-[#D60565] to-[#FF0077] flex items-center justify-center shadow-2xl">
              <div className="text-center text-white">
                <div className="text-6xl mb-4">🎁</div>
                <div className="text-4xl font-bold mb-2">{placeholderBrandName}</div>
                <div className="text-2xl font-light">{placeholderCardText}</div>
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="text-center">
        <h2 className="text-[32px] md:text-[52px] lg:text-6xl font-normal  text-secondary mb-4 md:mb-9 lg:mb-12">
          {heroSubtitle}
        </h2>
        <p className="tex-sm md:text-base lg:text-lg  text-secondary font-normal max-w-2xl mx-auto mb-3 lg:mb-5">
          {heroDescription}
        </p>
        {giftCardsEnabled && (
          <>
            <p className="text-sm md:text-base lg:text-lg  text-secondary font-normal mb-1 lg:mb-3">
              {businessText}
            </p>
            <Link className="underline" href={bulkPurchaseUrl}>
              {bulkLinkText}
            </Link>
          </>
        )}
      </div>
    </div>
    </div>
  );
};

export default GiftsHero;
