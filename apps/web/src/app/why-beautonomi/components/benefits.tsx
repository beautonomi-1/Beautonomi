"use client";

import React from "react";
import { CheckCircle2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

interface PageContent {
  [sectionKey: string]: {
    content: string;
    content_type: string;
    metadata: Record<string, any>;
  };
}

interface BenefitsProps {
  content?: PageContent | null;
}

export default function Benefits({ content }: BenefitsProps) {
  // Get benefits from CMS or use defaults
  let benefits = [
    "Easy booking management",
    "Secure payment processing",
    "Client relationship management",
    "Automated reminders",
    "Business analytics & insights",
    "Mobile-friendly platform",
  ];

  if (content?.benefits_list?.content_type === "json") {
    try {
      const parsedBenefits = JSON.parse(content.benefits_list.content);
      if (Array.isArray(parsedBenefits) && parsedBenefits.length > 0) {
        benefits = parsedBenefits;
      }
    } catch (e) {
      console.error("Failed to parse benefits_list from CMS:", e);
    }
  }

  const sectionTitle = content?.benefits_title?.content || "Why choose Beautonomi?";
  const sectionDescription = content?.benefits_description?.content || "Join thousands of beauty professionals who trust Beautonomi to power their business.";
  const ctaText = content?.benefits_cta_text?.content || "Start Your Journey";
  const ctaUrl = content?.benefits_cta_url?.content || "/signup?type=provider";
  const benefitsImage = content?.benefits_image?.content;

  return (
    <div className="pb-16 md:pb-24 lg:pb-28">
      <div className="container">
        <div className="flex flex-col lg:flex-row items-center justify-between gap-8 lg:gap-12">
          <div className="w-full lg:w-1/2">
            <h2 className="text-[32px] md:text-[48px] lg:text-[56px] font-normal text-secondary mb-4 md:mb-6">
              {sectionTitle}
            </h2>
            <p className="text-base md:text-lg text-secondary font-light mb-6 md:mb-8 leading-relaxed">
              {sectionDescription}
            </p>
            <div className="space-y-4 mb-8">
              {benefits.map((benefit, index) => (
                <div key={index} className="flex items-center gap-3">
                  <div className="flex-shrink-0 w-6 h-6 bg-gradient-to-br from-[#FF0077] to-[#D60565] rounded-full flex items-center justify-center">
                    <CheckCircle2 className="w-4 h-4 text-white" />
                  </div>
                  <span className="text-base md:text-lg text-secondary font-normal">
                    {benefit}
                  </span>
                </div>
              ))}
            </div>
            <Link href={ctaUrl}>
              <Button 
                variant="default" 
                size="rounded"
                className="bg-gradient-to-r from-[#FF0077] to-[#D60565] hover:from-[#D60565] hover:to-[#FF0077] text-white"
              >
                {ctaText}
                <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            </Link>
          </div>
          <div className="w-full lg:w-1/2">
            {benefitsImage ? (
              <img 
                src={benefitsImage} 
                alt="Benefits" 
                className="w-full h-[400px] md:h-[500px] object-cover rounded-2xl shadow-2xl" 
              />
            ) : (
              <div className="w-full h-[400px] md:h-[500px] rounded-2xl bg-gradient-to-br from-[#FF0077] via-[#D60565] to-[#FF0077] flex items-center justify-center shadow-2xl relative overflow-hidden">
                <div className="absolute inset-0 opacity-20">
                  <div className="absolute top-0 left-0 w-64 h-64 bg-white rounded-full blur-3xl"></div>
                  <div className="absolute bottom-0 right-0 w-64 h-64 bg-white rounded-full blur-3xl"></div>
                </div>
                <div className="text-center text-white relative z-10">
                  <div className="text-6xl mb-4">✨</div>
                  <div className="text-2xl md:text-3xl font-bold">Your Success</div>
                  <div className="text-lg md:text-xl font-light mt-2">Our Mission</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
