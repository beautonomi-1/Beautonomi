"use client";

import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

interface PageContent {
  [sectionKey: string]: {
    content: string;
    content_type: string;
    metadata: Record<string, any>;
  };
}

interface CTABannerProps {
  content?: PageContent | null;
}

export default function CTABanner({ content }: CTABannerProps) {
  // Get content from CMS or use defaults
  const bannerTitle = content?.cta_banner_title?.content || "Ready to grow your beauty business?";
  const bannerDescription = content?.cta_banner_description?.content || "Join Beautonomi today and discover why thousands of beauty professionals choose us.";
  const ctaButtonText = content?.cta_banner_button_text?.content || "Get Started";
  const ctaUrl = content?.cta_banner_url?.content || "/signup?type=provider";
  const bannerImage = content?.cta_banner_image?.content;

  return (
    <div className="pb-16 md:pb-24 lg:pb-28">
      <div className="container">
        <div className="flex flex-col md:flex-row bg-gradient-to-r from-[#FF0077] via-[#D60565] to-[#FF0077] rounded-2xl md:rounded-3xl overflow-hidden shadow-2xl">
          <div className="w-full md:w-1/2 p-8 md:p-12 lg:p-16 flex flex-col justify-center">
            <h2 className="text-[32px] md:text-[48px] lg:text-[56px] font-normal text-white mb-4 md:mb-6 leading-tight">
              {bannerTitle}
            </h2>
            <p className="text-base md:text-lg lg:text-xl font-light text-white/90 mb-6 md:mb-8 leading-relaxed">
              {bannerDescription}
            </p>
            <Link href={ctaUrl}>
              <Button 
                variant="secondary" 
                size="rounded"
                className="bg-white text-[#FF0077] hover:bg-gray-100 w-full md:w-auto"
              >
                {ctaButtonText}
                <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            </Link>
          </div>
          <div className="w-full md:w-1/2 h-[300px] md:h-auto">
            {bannerImage ? (
              <img 
                src={bannerImage} 
                alt="CTA Banner" 
                className="w-full h-full object-cover" 
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-white/10 to-white/5 flex items-center justify-center">
                <div className="text-center text-white">
                  <div className="text-6xl mb-4">🚀</div>
                  <div className="text-2xl font-bold">Start Today</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
