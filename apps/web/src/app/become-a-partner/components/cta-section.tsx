"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/providers/AuthProvider";
import { usePageContent } from "@/hooks/usePageContent";
import { CmsHtml } from "@/components/cms/CmsHtml";
import { cmsContentLooksLikeHtml } from "@/lib/html/cms-page-html";

export default function CTASection() {
  const router = useRouter();
  const { user, role, isLoading } = useAuth();
  const { getSectionContent } = usePageContent("become-a-partner");
  const ctaTitle = getSectionContent("cta_title") || "Ready to grow your beauty business?";
  const ctaDescription =
    getSectionContent("cta_description") ||
    "Join thousands of beauty professionals who trust Beautonomi to manage their business";

  /** Same routing as hero primary CTA: partner signup funnel → `/signup?type=provider`, signed-in → app surface. */
  const handleTryItNow = () => {
    if (isLoading) return;
    if (user) {
      if (role === "provider_owner") {
        router.push("/provider/dashboard");
      } else if (role === "provider_staff") {
        router.push("/provider/onboarding");
      } else {
        router.push("/provider/onboarding");
      }
      return;
    }
    router.push("/provider/signup");
  };

  return (
    <div className="py-12 sm:py-16 md:py-20 bg-gradient-to-br from-purple-50 via-pink-50 to-orange-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900 mb-3 sm:mb-4 px-4">
          {cmsContentLooksLikeHtml(ctaTitle) ? (
            <CmsHtml html={ctaTitle} className="block" as="span" />
          ) : (
            ctaTitle
          )}
        </h2>
        <p className="text-base sm:text-lg text-gray-600 mb-6 sm:mb-8 max-w-2xl mx-auto px-4">
          {cmsContentLooksLikeHtml(ctaDescription) ? (
            <CmsHtml html={ctaDescription} className="block" as="span" />
          ) : (
            ctaDescription
          )}
        </p>
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center px-4">
          <Button
            size="lg"
            onClick={handleTryItNow}
            className="bg-primary hover:bg-primary-hover text-white px-8 py-6 text-lg font-semibold rounded-full shadow-lg hover:shadow-xl transition-all duration-300"
          >
            Get started
            <ArrowRight className="ml-2 w-5 h-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
