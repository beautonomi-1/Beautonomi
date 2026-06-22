"use client";

import { Button } from "@/components/ui/button";
import React from "react";
import Link from "next/link";
import Image from "next/image";
import { Gift, ShieldCheck, Sparkles, Zap } from "lucide-react";
import { DEFAULT_GIFT_CARD_DESIGNS } from "./default-designs";

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
  const heroTitle = content?.hero_title?.content || "Gifts that make them glow";
  const heroSubtitle = content?.hero_subtitle?.content || "You give. They glow.";
  const heroDescription =
    content?.hero_description?.content ||
    "Bring the world of Beautonomi to friends and family. Celebrate holidays, recognise milestones, and treat them to beauty and wellness services — delivered in minutes and never expiring.";
  const businessText = content?.business_text?.content || "Purchasing for business?";
  const buyNowButtonText = content?.buy_now_button_text?.content || "Buy a gift card";
  const bulkLinkText = content?.bulk_link_text?.content || "Buy gift cards in bulk";
  const purchaseUrl = content?.purchase_url?.content || "/gift-card/purchase";
  const bulkPurchaseUrl = content?.bulk_purchase_url?.content || "/gift-card/purchase?bulk=true";

  // Get images from CMS or use the on-brand layered card artwork as a fallback.
  const cardBackgroundImage = content?.card_background_image?.content;
  const cardOverlayImage = content?.card_overlay_image?.content;

  const heroCards = [
    DEFAULT_GIFT_CARD_DESIGNS[2],
    DEFAULT_GIFT_CARD_DESIGNS[0],
    DEFAULT_GIFT_CARD_DESIGNS[1],
  ];

  return (
    <section className="relative overflow-hidden">
      {/* Ambient brand glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
      >
        <div className="absolute -top-32 right-[-10%] h-[480px] w-[480px] rounded-full bg-primary/15 blur-[120px]" />
        <div className="absolute top-40 left-[-10%] h-[420px] w-[420px] rounded-full bg-[#FFD6E7]/60 blur-[120px]" />
      </div>

      <div className="container pt-10 md:pt-16 lg:pt-20 pb-16 md:pb-20 lg:pb-24">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-10">
          {/* Copy */}
          <div className="gift-rise text-center lg:text-left">
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm font-medium text-primary">
              <Sparkles className="h-4 w-4" />
              Beautonomi gift cards
            </span>
            <h1 className="mt-6 text-[44px] leading-[1.04] tracking-[-0.02em] text-secondary md:text-[64px] lg:text-[76px]">
              {heroTitle}
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-base text-secondary/70 md:text-lg lg:mx-0">
              {heroDescription}
            </p>

            {giftCardsEnabled ? (
              <div className="mt-9 flex flex-col items-center gap-4 sm:flex-row lg:items-start lg:justify-start justify-center">
                <Link href={purchaseUrl} className="w-full sm:w-auto">
                  <Button
                    variant="secondary"
                    size="rounded"
                    className="w-full shadow-lg shadow-primary/20 transition-transform duration-200 hover:-translate-y-0.5 active:scale-[0.98] sm:w-auto"
                  >
                    {buyNowButtonText}
                  </Button>
                </Link>
                <Link href={bulkPurchaseUrl} className="w-full sm:w-auto">
                  <Button
                    variant="outline"
                    size="rounded"
                    className="w-full border-secondary/15 text-secondary transition-transform duration-200 hover:-translate-y-0.5 hover:border-secondary/30 active:scale-[0.98] sm:w-auto"
                  >
                    {bulkLinkText}
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="mt-9 inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-5 py-2.5 text-sm font-medium text-amber-800">
                Gift cards are currently unavailable. Check back soon.
              </div>
            )}

            {giftCardsEnabled && (
              <p className="mt-5 text-sm text-secondary/60">
                {businessText}{" "}
                <Link href={bulkPurchaseUrl} className="font-medium text-secondary underline underline-offset-4">
                  {bulkLinkText}
                </Link>
              </p>
            )}

            {/* Trust signals */}
            <ul className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 lg:justify-start">
              {[
                { icon: Zap, label: "Delivered in minutes" },
                { icon: ShieldCheck, label: "Secure checkout" },
                { icon: Gift, label: "Never expires" },
              ].map(({ icon: Icon, label }) => (
                <li key={label} className="flex items-center gap-2 text-sm font-medium text-secondary/70">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  {label}
                </li>
              ))}
            </ul>
          </div>

          {/* Visual */}
          <div className="gift-rise relative mx-auto w-full max-w-xl [animation-delay:120ms]">
            {cardBackgroundImage && cardOverlayImage ? (
              <div className="relative mx-auto aspect-[3/2] w-full overflow-hidden rounded-[28px] shadow-2xl">
                <Image src={cardBackgroundImage} alt="Gift card" fill className="object-cover" unoptimized />
                <Image src={cardOverlayImage} alt="" fill className="object-cover" unoptimized />
              </div>
            ) : (
              <div className="relative mx-auto aspect-square w-full max-w-[520px]">
                {/* Back card */}
                <div
                  className="gift-float absolute left-[8%] top-[14%] w-[74%] rotate-[-9deg] [--gc-rot:-9deg] [animation-delay:0.4s]"
                >
                  <div className="overflow-hidden rounded-[22px] shadow-xl ring-1 ring-black/5">
                    <Image
                      src={heroCards[0].src}
                      alt={heroCards[0].alt}
                      width={1200}
                      height={800}
                      className="h-auto w-full"
                      unoptimized
                    />
                  </div>
                </div>
                {/* Right card */}
                <div
                  className="gift-float absolute right-[4%] top-[26%] w-[72%] rotate-[10deg] [--gc-rot:10deg] [animation-delay:1.2s]"
                >
                  <div className="overflow-hidden rounded-[22px] shadow-xl ring-1 ring-black/5">
                    <Image
                      src={heroCards[2].src}
                      alt={heroCards[2].alt}
                      width={1200}
                      height={800}
                      className="h-auto w-full"
                      unoptimized
                    />
                  </div>
                </div>
                {/* Front hero card */}
                <div className="gift-float gift-sheen absolute left-1/2 top-1/2 w-[82%] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[26px] shadow-2xl ring-1 ring-black/5">
                  <Image
                    src={heroCards[1].src}
                    alt={heroCards[1].alt}
                    width={1200}
                    height={800}
                    className="h-auto w-full"
                    priority
                    unoptimized
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Tagline band */}
        <div className="mt-16 border-t border-secondary/10 pt-12 text-center md:mt-20 md:pt-16">
          <h2 className="text-[32px] text-secondary md:text-[48px] lg:text-[56px]">
            {heroSubtitle}
          </h2>
        </div>
      </div>
    </section>
  );
};

export default GiftsHero;
