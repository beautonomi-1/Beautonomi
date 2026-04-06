"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/providers/AuthProvider";
import LoginModal from "@/components/global/login-modal";
import { usePageContent } from "@/hooks/usePageContent";

export default function CTASection() {
  const router = useRouter();
  const { user, role, isLoading } = useAuth();
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const { getSectionContent } = usePageContent("become-a-partner");
  const ctaTitle = getSectionContent("cta_title") || "Ready to grow your beauty business?";
  const ctaDescription =
    getSectionContent("cta_description") ||
    "Join thousands of beauty professionals who trust Beautonomi to manage their business";

  const handleTryItNow = () => {
    if (isLoading) return;

    if (!user) {
      setIsLoginModalOpen(true);
    } else if (role === "provider_owner" || role === "provider_staff") {
      router.push("/provider/dashboard");
    } else {
      router.push("/provider/onboarding");
    }
  };

  return (
    <>
      <div className="py-12 sm:py-16 md:py-20 bg-gradient-to-br from-purple-50 via-pink-50 to-orange-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900 mb-3 sm:mb-4 px-4">
            {ctaTitle.includes("<") ? (
              <span dangerouslySetInnerHTML={{ __html: ctaTitle }} />
            ) : (
              ctaTitle
            )}
          </h2>
          <p className="text-base sm:text-lg text-gray-600 mb-6 sm:mb-8 max-w-2xl mx-auto px-4">
            {ctaDescription.includes("<") ? (
              <span dangerouslySetInnerHTML={{ __html: ctaDescription }} />
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
      <LoginModal
        open={isLoginModalOpen}
        setOpen={setIsLoginModalOpen}
        initialMode="login"
        redirectContext="provider"
      />
    </>
  );
}
