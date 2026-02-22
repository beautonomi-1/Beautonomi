"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Play } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/providers/AuthProvider";
import LoginModal from "@/components/global/login-modal";
import { usePageContent } from "@/hooks/usePageContent";

interface PartnerHeroProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export default function PartnerHero({ activeTab, setActiveTab }: PartnerHeroProps) {
  const router = useRouter();
  const { user, role, isLoading } = useAuth();
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [loginModalMode, _setLoginModalMode] = useState<"login" | "signup">("login");
  const { getSectionContent } = usePageContent("become-a-partner");

  // Get content from API or use defaults
  const heroTitle = getSectionContent("hero_title") || "Everything you need to grow your beauty business";
  const heroDescription = getSectionContent("hero_description") || "Manage bookings, accept payments, automate your workflow, and more. A complete platform built for beauty professionals—fast, beautiful, intuitive, and works on any device.";

  const handleVideoTour = () => {
    // For video tour, we can either:
    // 1. Open a video modal/player
    // 2. Navigate to a video page
    // 3. Or redirect to dashboard if logged in
    if (!user) {
      setIsLoginModalOpen(true);
    } else if (role === "provider_owner" || role === "provider_staff") {
      router.push("/provider/dashboard");
    } else {
      router.push("/provider/onboarding");
    }
  };

  const handleSignUp = () => {
    if (isLoading) return;
    
    // If user is already logged in, redirect to onboarding (they can become a provider)
    if (user) {
      if (role === "provider_owner" || role === "provider_staff") {
        router.push("/provider/dashboard");
      } else {
        // Logged in as customer - redirect to onboarding to become a provider
        router.push("/provider/onboarding");
      }
      return;
    }
    
    // Not logged in - navigate to signup page with provider type
    router.push("/signup?type=provider");
  };

  const _handleTryItNow = () => {
    if (isLoading) return;
    
    if (!user) {
      setIsLoginModalOpen(true);
    } else if (role === "provider_owner" || role === "provider_staff") {
      router.push("/provider/dashboard");
    } else {
      router.push("/provider/onboarding");
    }
  };

  const handleBookDemo = () => {
    if (isLoading) return;
    
    if (!user) {
      setIsLoginModalOpen(true);
    } else if (role === "provider_owner" || role === "provider_staff") {
      router.push("/provider/dashboard");
    } else {
      router.push("/provider/onboarding");
    }
  };

  const _handleBecomeServiceProvider = () => {
    if (isLoading) return;
    
    if (!user) {
      // Navigate to signup page with provider type
      router.push("/signup?type=provider");
    } else if (role === "provider_owner" || role === "provider_staff") {
      router.push("/provider/dashboard");
    } else {
      router.push("/provider/onboarding");
    }
  };

  return (
    <>
      <div className="relative overflow-hidden bg-gradient-to-br from-purple-50 via-pink-50 to-orange-50 py-16 md:py-24 lg:py-32">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-4xl mx-auto">
            {/* Main Headline */}
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-gray-900 mb-4 md:mb-6 leading-tight px-4">
              {heroTitle.includes('<') ? (
                <span dangerouslySetInnerHTML={{ __html: heroTitle }} />
              ) : heroTitle.toLowerCase().includes("salon and spa") ? (
                <>
                  {heroTitle.replace(/salon and spa/gi, "").trim()}{" "}
                  <span className="text-[#FF0077]">salon and spa</span>
                </>
              ) : (
                heroTitle
              )}
            </h1>

            {/* Sub-headline */}
            <p className="text-base sm:text-lg md:text-xl text-gray-600 mb-6 md:mb-8 max-w-2xl mx-auto leading-relaxed px-4">
              {heroDescription.includes('<') ? (
                <span dangerouslySetInnerHTML={{ __html: heroDescription }} />
              ) : (
                heroDescription
              )}
            </p>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center mb-8 md:mb-12 px-4">
              <Button
                size="lg"
                onClick={handleSignUp}
                className="bg-[#FF0077] hover:bg-[#D60565] text-white px-6 md:px-8 py-4 md:py-6 text-base md:text-lg font-semibold rounded-full shadow-lg hover:shadow-xl transition-all duration-300"
              >
                Sign up
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={handleBookDemo}
                className="border-2 border-[#FF0077] text-[#FF0077] hover:bg-[#FF0077] hover:text-white px-6 md:px-8 py-4 md:py-6 text-base md:text-lg font-semibold rounded-full transition-all duration-300"
              >
                Book a demo
              </Button>
            </div>

            {/* Video Tour Button */}
            <div className="flex justify-center mb-8 md:mb-12 px-4">
              <Button
                size="lg"
                variant="ghost"
                onClick={handleVideoTour}
                className="text-[#FF0077] hover:text-[#D60565] hover:bg-pink-50 px-6 md:px-8 py-4 md:py-6 text-base md:text-lg font-semibold rounded-full transition-all duration-300 flex items-center gap-2 md:gap-3"
              >
                <Play className="w-5 h-5 md:w-6 md:h-6 fill-[#FF0077]" />
                <span className="hidden sm:inline">WATCH A VIDEO TOUR</span>
                <span className="sm:hidden">VIDEO TOUR</span>
              </Button>
            </div>

          {/* Feature Pills/Tabs */}
          <div className="flex flex-wrap justify-center gap-2 sm:gap-3 md:gap-4 px-4 mb-8 md:mb-12">
            {[
              "CALENDAR",
              "ONLINE BOOKING",
              "CUSTOM SERVICES",
              "CALLS & TEXTS",
              "HOUSE CALLS",
            ].map((feature) => (
              <button
                key={feature}
                onClick={() => setActiveTab(feature)}
                className={`px-4 sm:px-5 md:px-6 py-2.5 md:py-3 rounded-full text-xs sm:text-sm font-semibold transition-all duration-200 whitespace-nowrap ${
                  activeTab === feature
                    ? "bg-[#FF0077] text-white border-2 border-[#FF0077] shadow-md"
                    : "bg-white border-2 border-pink-200 text-gray-700 hover:border-[#FF0077] hover:text-[#FF0077] shadow-sm hover:shadow-md"
                }`}
              >
                {feature}
              </button>
            ))}
          </div>
        </div>
      </div>
      </div>
      <LoginModal 
        open={isLoginModalOpen} 
        setOpen={setIsLoginModalOpen}
        initialMode={loginModalMode}
        redirectContext="provider"
      />
    </>
  );
}
