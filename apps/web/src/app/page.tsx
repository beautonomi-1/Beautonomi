"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { useAmplitude } from "@/hooks/useAmplitude";
import { EVENT_HOME_VIEW } from "@/lib/analytics/amplitude/types";
import BeautonomiHeader from "@/components/layout/beautonomi-header";
import TopRatedSection from "./home/components/top-rated-section";
import NearestProvidersSection from "./home/components/nearest-providers-section";
import HottestPicksSection from "./home/components/hottest-picks-section";
import UpcomingTalentSection from "./home/components/upcoming-talent-section";
import BrowseByCitySection from "./home/components/browse-by-city-section";
import Footer from "@/components/layout/footer";
import BottomNav from "@/components/layout/bottom-nav";
import HomeLoginHandler from "./home-login-handler";

const Page = () => {
  const searchParams = useSearchParams();
  const { track, isReady } = useAmplitude();

  useEffect(() => {
    // Track home view
    if (isReady) {
      track(EVENT_HOME_VIEW);
    }
  }, [isReady, track]);

  useEffect(() => {
    // Show welcome message if user just completed onboarding
    if (searchParams.get("onboarded") === "true") {
      toast.success("Welcome to Beautonomi! Start exploring beauty services.", {
        duration: 5000,
      });
      // Clean up URL
      window.history.replaceState({}, "", "/");
    }
  }, [searchParams]);

  return (
    <div className="min-h-screen bg-white pb-20 md:pb-0 overflow-x-hidden w-full max-w-full">
      <BeautonomiHeader />
      <div className="pt-4 md:pt-6 w-full max-w-full overflow-x-hidden">
        <TopRatedSection />
        <NearestProvidersSection />
        <HottestPicksSection />
        <UpcomingTalentSection />
      </div>
      <BrowseByCitySection />
      <Footer />
      <BottomNav />
      <HomeLoginHandler />
    </div>
  );
};

export default Page;
