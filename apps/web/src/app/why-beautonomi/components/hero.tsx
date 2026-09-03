"use client";

import { Button } from "@/components/ui/button";
import React from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Star } from "lucide-react";
import { ProviderWebDashboardScreen } from "@/components/mockups/screens/web";
import { CustomerHomeScreen } from "@/components/mockups/screens/customer-mobile";

interface PageContent {
  [sectionKey: string]: {
    content: string;
    content_type: string;
    metadata: Record<string, any>;
  };
}

interface WhyBeautonomiHeroProps {
  content?: PageContent | null;
}

const WhyBeautonomiHero = ({ content }: WhyBeautonomiHeroProps) => {
  const heroEyebrow = content?.hero_eyebrow?.content || "The beauty operating system";
  const heroTitle = content?.hero_title?.content || "Why Beautonomi?";
  const heroSubtitle =
    content?.hero_subtitle?.content || "The platform built for beauty professionals";
  const heroDescription =
    content?.hero_description?.content ||
    "Bookings, payments, clients and growth — beautifully connected in one place. Spend less time on admin and more time doing what you love.";
  const ctaButtonText = content?.cta_button_text?.content || "Get started free";
  const ctaUrl = content?.cta_url?.content || "/provider/signup";
  const secondaryCtaText = content?.hero_secondary_cta_text?.content || "Explore the platform";
  const secondaryCtaUrl = content?.hero_secondary_cta_url?.content || "/explore";
  const trustText =
    content?.hero_trust_text?.content || "Rated #1 by thousands of beauty & wellness professionals";
  const heroImage = content?.hero_image?.content;

  return (
    <section className="relative overflow-hidden">
      {/* Ambient brand glow */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 left-1/2 h-[420px] w-[820px] -translate-x-1/2 rounded-full bg-[#FFE7F1]/70 blur-3xl" />
        <div className="absolute right-[-120px] top-32 h-[320px] w-[320px] rounded-full bg-primary/10 blur-3xl" />
      </div>

      <div className="container relative pt-10 md:pt-16 lg:pt-20 pb-16 md:pb-20 lg:pb-24">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-[#FFE7F1]/60 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-primary">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            {heroEyebrow}
          </span>

          <h1 className="mt-6 text-[clamp(2.75rem,8vw,5.5rem)] font-semibold leading-[1.02] tracking-tight text-secondary">
            {heroTitle}
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-lg md:text-xl font-light leading-relaxed text-gray-600">
            {heroDescription}
          </p>

          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href={ctaUrl} className="w-full sm:w-auto">
              <Button
                variant="secondary"
                size="rounded"
                className="w-full bg-gradient-to-r from-[#FF0077] to-[#D60565] px-8 text-white shadow-lg shadow-primary/25 transition-transform hover:scale-[1.02] hover:from-[#D60565] hover:to-[#FF0077] sm:w-auto"
              >
                {ctaButtonText}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <Link href={secondaryCtaUrl} className="w-full sm:w-auto">
              <Button
                variant="outline"
                size="rounded"
                className="w-full border-gray-300 px-8 text-secondary hover:border-primary hover:text-primary sm:w-auto"
              >
                {secondaryCtaText}
              </Button>
            </Link>
          </div>

          <div className="mt-7 flex items-center justify-center gap-2 text-sm text-gray-500">
            <span className="flex items-center gap-0.5" aria-hidden>
              {[...Array(5)].map((_, i) => (
                <Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" />
              ))}
            </span>
            <span className="font-medium text-secondary">{trustText}</span>
          </div>
        </div>

        {/* Product preview */}
        <div className="relative mx-auto mt-14 max-w-5xl md:mt-20">
          {heroImage ? (
            <div className="relative z-10 mx-auto h-[460px] w-full max-w-[940px] overflow-hidden rounded-3xl shadow-2xl md:h-[600px]">
              <Image src={heroImage} alt={heroSubtitle} fill className="object-cover" unoptimized />
            </div>
          ) : (
            <div className="relative">
              <div
                aria-hidden
                className="absolute inset-x-6 top-10 bottom-0 rounded-[2.5rem] bg-gradient-to-b from-[#FFE7F1]/60 to-transparent blur-2xl"
              />
              <div className="relative z-10 px-2 sm:px-6">
                <ProviderWebDashboardScreen />
              </div>
              {/* Overlapping mobile preview for depth + dual-surface story */}
              <div className="absolute -bottom-10 right-2 z-20 hidden w-[210px] drop-shadow-2xl sm:block md:right-8 lg:right-16">
                <CustomerHomeScreen />
              </div>
            </div>
          )}
        </div>

        <div className="mt-20 text-center md:mt-24">
          <h2 className="text-[clamp(1.75rem,4vw,3.25rem)] font-semibold tracking-tight text-secondary">
            {heroSubtitle}
          </h2>
        </div>
      </div>
    </section>
  );
};

export default WhyBeautonomiHero;
