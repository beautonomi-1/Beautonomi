"use client";

import { Button } from "@/components/ui/button";
import React from "react";
import Link from "next/link";
import { ArrowRight, Sparkles, Heart, Star } from "lucide-react";

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
  // Get content from CMS or use defaults
  const heroTitle = content?.hero_title?.content || "Why Beautonomi?";
  const heroSubtitle = content?.hero_subtitle?.content || "The platform built for beauty professionals";
  const heroDescription = content?.hero_description?.content || "Discover what makes Beautonomi the leading platform for beauty and wellness services. Built with care, designed for growth.";
  const ctaButtonText = content?.cta_button_text?.content || "Get Started";
  const ctaUrl = content?.cta_url?.content || "/signup?type=provider";
  const heroImage = content?.hero_image?.content;

  return (
    <div className="pb-20 md:pb-24 lg:pb-16">
      <div className="container">
        <div className="mb-14">
          <h1 className="text-[56px] md:text-[100px] lg:text-[128px] font-normal text-secondary max-w-4xl leading-[50px] md:leading-[90px] lg:leading-[130px] mx-auto text-center mb-6 lg:mb-10">
            {heroTitle}
          </h1>
          <div className="text-center mb-10 lg:mb-14">
            <Link href={ctaUrl}>
              <Button variant="secondary" size="rounded" className="bg-gradient-to-r from-[#FF0077] to-[#D60565] hover:from-[#D60565] hover:to-[#FF0077] text-white">
                {ctaButtonText}
                <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            </Link>
          </div>
          <div className="relative mx-auto">
            {heroImage ? (
              <img 
                src={heroImage} 
                alt="Why Beautonomi"  
                className="z-10 w-full max-w-[900px] h-[500px] md:h-[650px] mx-auto object-cover rounded-2xl shadow-2xl" 
              />
            ) : (
              <div className="w-full max-w-[900px] h-[500px] md:h-[650px] mx-auto rounded-2xl bg-gradient-to-br from-[#FF0077] via-[#D60565] to-[#FF0077] flex items-center justify-center shadow-2xl relative overflow-hidden">
                <div className="absolute inset-0 opacity-20">
                  <div className="absolute top-10 left-10 w-32 h-32 bg-white rounded-full blur-3xl"></div>
                  <div className="absolute bottom-10 right-10 w-40 h-40 bg-white rounded-full blur-3xl"></div>
                  <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-white rounded-full blur-3xl"></div>
                </div>
                <div className="text-center text-white relative z-10">
                  <div className="flex justify-center gap-4 mb-6">
                    <Sparkles className="w-12 h-12 md:w-16 md:h-16" />
                    <Heart className="w-12 h-12 md:w-16 md:h-16" />
                    <Star className="w-12 h-12 md:w-16 md:h-16" />
                  </div>
                  <div className="text-3xl md:text-4xl font-bold mb-2">Beautonomi</div>
                  <div className="text-xl md:text-2xl font-light">Beauty. Simplified.</div>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="text-center">
          <h2 className="text-[32px] md:text-[52px] lg:text-6xl font-normal text-secondary mb-4 md:mb-6 lg:mb-8">
            {heroSubtitle}
          </h2>
          <p className="text-sm md:text-base lg:text-lg text-secondary font-normal max-w-3xl mx-auto mb-3 lg:mb-5 leading-relaxed">
            {heroDescription}
          </p>
        </div>
      </div>
    </div>
  );
};

export default WhyBeautonomiHero;
