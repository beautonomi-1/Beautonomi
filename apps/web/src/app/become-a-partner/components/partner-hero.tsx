"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Play } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/providers/AuthProvider";
import { usePageContent } from "@/hooks/usePageContent";
import { CmsHtml } from "@/components/cms/CmsHtml";
import { cmsContentLooksLikeHtml } from "@/lib/html/cms-page-html";
import { getVideoEmbedUrl } from "../lib/video-embed";
import { VideoTourModal } from "./video-tour-modal";

const DEFAULT_PARTNER_FEATURE_TABS = [
  "CALENDAR",
  "ONLINE BOOKING",
  "CUSTOM SERVICES",
  "CALLS & TEXTS",
  "HOUSE CALLS",
] as const;

interface PartnerHeroProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export default function PartnerHero({ activeTab, setActiveTab }: PartnerHeroProps) {
  const router = useRouter();
  const { user, role, isLoading } = useAuth();
  const [showVideoModal, setShowVideoModal] = useState(false);
  const { content, getSectionContent } = usePageContent("become-a-partner");

  const heroTitle = getSectionContent("hero_title") || "Everything you need to grow your beauty business";
  const heroDescription =
    getSectionContent("hero_description") ||
    "Manage bookings, accept payments, automate your workflow, and more. A complete platform built for beauty professionals—fast, beautiful, intuitive, and works on any device.";
  const primaryCtaLabel = getSectionContent("hero_primary_cta_label")?.trim() || "Sign up";
  const featureTabs = useMemo(() => {
    const featureTabsRaw = content["hero_feature_tabs"]?.[0]?.content?.trim();
    if (!featureTabsRaw) return [...DEFAULT_PARTNER_FEATURE_TABS];
    try {
      const parsed = JSON.parse(featureTabsRaw) as unknown;
      if (Array.isArray(parsed)) {
        const next = parsed.map((x) => String(x).trim()).filter(Boolean);
        if (next.length) return next;
      }
    } catch {
      /* keep defaults */
    }
    return [...DEFAULT_PARTNER_FEATURE_TABS];
  }, [content]);
  const videoTourUrl = getSectionContent("video_tour_url")?.trim() || null;
  const videoEmbedUrl = videoTourUrl ? getVideoEmbedUrl(videoTourUrl) : null;

  useEffect(() => {
    if (featureTabs.length && !featureTabs.includes(activeTab)) {
      setActiveTab(featureTabs[0]);
    }
  }, [featureTabs, activeTab, setActiveTab]);

  const handleViewDemo = () => {
    if (videoEmbedUrl) {
      setShowVideoModal(true);
      return;
    }
    const demoEl = document.getElementById("app-demo");
    if (demoEl) {
      demoEl.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  const handleSignUp = () => {
    if (isLoading) return;

    if (user) {
      if (role === "provider_owner" || role === "provider_staff") {
        router.push("/provider/dashboard");
      } else {
        router.push("/provider/onboarding");
      }
      return;
    }

    router.push("/signup?type=provider");
  };

  return (
    <>
      <div className="relative overflow-hidden bg-gradient-to-br from-purple-50 via-pink-50 to-orange-50 py-16 md:py-24 lg:py-32">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-4xl mx-auto">
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-gray-900 mb-4 md:mb-6 leading-tight px-4">
              {cmsContentLooksLikeHtml(heroTitle) ? (
                <CmsHtml html={heroTitle} className="block" as="span" />
              ) : heroTitle.toLowerCase().includes("salon and spa") ? (
                <>
                  {heroTitle.replace(/salon and spa/gi, "").trim()}{" "}
                  <span className="text-primary">salon and spa</span>
                </>
              ) : (
                heroTitle
              )}
            </h1>

            <p className="text-base sm:text-lg md:text-xl text-gray-600 mb-6 md:mb-8 max-w-2xl mx-auto leading-relaxed px-4">
              {cmsContentLooksLikeHtml(heroDescription) ? (
                <CmsHtml html={heroDescription} className="block" as="span" />
              ) : (
                heroDescription
              )}
            </p>

            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center mb-8 md:mb-12 px-4">
              <Button
                size="lg"
                onClick={handleSignUp}
                className="bg-primary hover:bg-primary-hover text-white px-6 md:px-8 py-4 md:py-6 text-base md:text-lg font-semibold rounded-full shadow-lg hover:shadow-xl transition-all duration-300"
              >
                {primaryCtaLabel}
              </Button>
            </div>

            <div className="flex justify-center mb-4 md:mb-6 px-4">
              <Button
                size="lg"
                variant="ghost"
                onClick={handleViewDemo}
                className="text-primary hover:text-primary-hover hover:bg-pink-50 px-6 md:px-8 py-4 md:py-6 text-base md:text-lg font-semibold rounded-full transition-all duration-300 flex items-center gap-2 md:gap-3"
              >
                <Play className="w-5 h-5 md:w-6 md:h-6 fill-primary" />
                <span>View demo</span>
              </Button>
            </div>

            <div className="flex flex-wrap justify-center gap-2 sm:gap-3 md:gap-4 px-4 mb-8 md:mb-12">
              {featureTabs.map((feature) => (
                <button
                  key={feature}
                  type="button"
                  onClick={() => setActiveTab(feature)}
                  className={`px-4 sm:px-5 md:px-6 py-2.5 md:py-3 rounded-full text-xs sm:text-sm font-semibold transition-all duration-200 whitespace-nowrap ${
                    activeTab === feature
                      ? "bg-primary text-white border-2 border-primary shadow-md"
                      : "bg-white border-2 border-pink-200 text-gray-700 hover:border-primary hover:text-primary shadow-sm hover:shadow-md"
                  }`}
                >
                  {feature}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
      <VideoTourModal open={showVideoModal} onOpenChange={setShowVideoModal} embedUrl={videoEmbedUrl} />
    </>
  );
}
