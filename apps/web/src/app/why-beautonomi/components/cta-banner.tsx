"use client";

import { Button } from "@/components/ui/button";
import Link from "next/link";
import Image from "next/image";
import React from "react";
import { ArrowRight, Check } from "lucide-react";
import { CustomerHomeScreen } from "@/components/mockups/screens/customer-mobile";

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
  const bannerTitle = content?.cta_banner_title?.content || "Ready to grow your beauty business?";
  const bannerDescription =
    content?.cta_banner_description?.content ||
    "Join Beautonomi today and discover why thousands of beauty professionals choose us to run their day.";
  const ctaButtonText = content?.cta_banner_button_text?.content || "Get started free";
  const ctaUrl = content?.cta_banner_url?.content || "/provider/signup";
  const bannerImage = content?.cta_banner_image?.content;

  let points: string[] = ["Free to get started", "Set up in minutes", "Cancel anytime"];
  if (content?.cta_banner_points?.content_type === "json") {
    try {
      const parsed = JSON.parse(content.cta_banner_points.content);
      if (Array.isArray(parsed) && parsed.length > 0) {
        points = parsed;
      }
    } catch (e) {
      console.error("Failed to parse cta_banner_points from CMS:", e);
    }
  }

  return (
    <div className="pb-16 md:pb-24 lg:pb-28">
      <div className="container">
        <div className="relative flex flex-col overflow-hidden rounded-3xl bg-gradient-to-br from-[#FF0077] via-[#D60565] to-[#FF0077] shadow-2xl shadow-primary/30 md:flex-row">
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <div className="absolute -left-16 -top-16 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
            <div className="absolute bottom-0 right-1/3 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
          </div>

          <div className="relative w-full p-8 md:w-3/5 md:p-12 lg:p-16">
            <h2 className="text-[clamp(1.875rem,4vw,3.5rem)] font-semibold leading-tight tracking-tight text-white">
              {bannerTitle}
            </h2>
            <p className="mt-4 max-w-xl text-base md:text-lg font-light leading-relaxed text-white/90">
              {bannerDescription}
            </p>

            <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2">
              {points.map((point, index) => (
                <span key={index} className="flex items-center gap-1.5 text-sm font-medium text-white/90">
                  <Check className="h-4 w-4 text-white" strokeWidth={3} />
                  {point}
                </span>
              ))}
            </div>

            <Link href={ctaUrl} className="mt-9 inline-block">
              <Button
                variant="secondary"
                size="rounded"
                className="bg-white px-8 text-[#FF0077] shadow-lg shadow-black/10 transition-transform hover:scale-[1.02] hover:bg-white"
              >
                {ctaButtonText}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>

          <div className="relative flex w-full items-end justify-center p-8 md:w-2/5 md:p-0">
            {bannerImage ? (
              <div className="relative h-[280px] w-full overflow-hidden md:h-auto md:min-h-[420px]">
                <Image src={bannerImage} alt={bannerTitle} fill className="object-cover" unoptimized />
              </div>
            ) : (
              <div className="relative w-full max-w-[260px] translate-y-2 md:translate-y-8">
                <div aria-hidden className="absolute inset-0 rounded-[2.5rem] bg-white/20 blur-2xl" />
                <div className="relative z-10">
                  <CustomerHomeScreen />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
