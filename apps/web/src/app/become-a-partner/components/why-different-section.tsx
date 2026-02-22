"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { usePageContent } from "@/hooks/usePageContent";

export default function WhyDifferentSection() {
  const { getSectionContent } = usePageContent("become-a-partner");
  const whyDifferentTitle = getSectionContent("why_different_title") || "Beauty business software, finally done right";
  const whyDifferentDescription = getSectionContent("why_different_description") || "Let's be real, most beauty business software isn't very good. Ugly design, slow speeds, interfaces that get in the way. We're taking a new approach and bringing modern tools to beauty professionals.";

  return (
    <div className="py-12 sm:py-16 md:py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto">
          <p className="text-xs sm:text-sm font-semibold text-[#FF0077] uppercase tracking-wider mb-3 sm:mb-4">
            WHY WE&apos;RE DIFFERENT
          </p>
          <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 mb-4 sm:mb-6 leading-tight">
            {whyDifferentTitle.includes('<') ? (
              <span dangerouslySetInnerHTML={{ __html: whyDifferentTitle }} />
            ) : (
              whyDifferentTitle
            )}
          </h2>
          <p className="text-base sm:text-lg md:text-xl text-gray-600 mb-6 sm:mb-8 leading-relaxed">
            {whyDifferentDescription.includes('<') ? (
              <span dangerouslySetInnerHTML={{ __html: whyDifferentDescription }} />
            ) : (
              whyDifferentDescription
            )}
          </p>
          <Button
            asChild
            variant="outline"
            className="border-2 border-[#FF0077] text-[#FF0077] hover:bg-[#FF0077] hover:text-white px-6 sm:px-8 py-3 sm:py-4 text-sm sm:text-base font-semibold rounded-full transition-all"
          >
            <Link href="/why-beautonomi">
              Learn why we&apos;re different
              <ArrowRight className="ml-2 w-4 h-4 sm:w-5 sm:h-5" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
