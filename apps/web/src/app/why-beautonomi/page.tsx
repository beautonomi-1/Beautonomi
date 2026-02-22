"use client";

import React, { useEffect, useState } from "react";
import BeautonomiHeader from "@/components/layout/beautonomi-header";
import Footer from "@/components/layout/footer";
import BottomNav from "@/components/layout/bottom-nav";
import { fetcher } from "@/lib/http/fetcher";
import WhyBeautonomiHero from "./components/hero";
import Features from "./components/features";
import Benefits from "./components/benefits";
import CTABanner from "./components/cta-banner";
import FAQ from "@/components/global/faq";

interface PageContent {
  [sectionKey: string]: {
    content: string;
    content_type: string;
    metadata: Record<string, any>;
  };
}

export default function WhyBeautonomiPage() {
  const [content, setContent] = useState<PageContent | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadContent = async () => {
      try {
        const response = await fetcher.get<{ data: PageContent }>("/api/public/page-content?page_slug=why-beautonomi");
        setContent(response.data);
      } catch (error) {
        console.error("Failed to load why-beautonomi page content:", error);
      } finally {
        setIsLoading(false);
      }
    };
    loadContent();
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white pb-20 md:pb-0">
        <BeautonomiHeader />
        <div className="container mx-auto px-4 py-16">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-1/3 mb-4"></div>
            <div className="h-4 bg-gray-200 rounded w-full mb-2"></div>
          </div>
        </div>
        <Footer />
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white pb-20 md:pb-0 overflow-x-hidden w-full max-w-full">
      <BeautonomiHeader />
      <WhyBeautonomiHero content={content} />
      <Features content={content} />
      <Benefits content={content} />
      <CTABanner content={content} />
      <FAQ applyBgPrimary={false} />
      <Footer />
      <BottomNav />
    </div>
  );
}
