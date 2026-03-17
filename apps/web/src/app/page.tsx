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
import SponsoredSection from "./home/components/sponsored-section";
import UpcomingTalentSection from "./home/components/upcoming-talent-section";
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

  const isDeactivated = searchParams.get("deactivated") === "true";

  return (
    <div className="min-h-screen bg-white pb-20 md:pb-0 overflow-x-hidden w-full max-w-full">
      <BeautonomiHeader />
      {isDeactivated && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-3 text-center text-sm text-amber-900">
          You deactivated your account.{" "}
          <a href="/reactivate" className="font-medium underline hover:no-underline">
            Reactivate your account
          </a>
          {" "}or{" "}
          <a href="/login?redirect=/" className="font-medium underline hover:no-underline">
            log in again
          </a>
          .
        </div>
      )}
      <div className="pt-4 md:pt-6 w-full max-w-full overflow-x-hidden">
        <TopRatedSection />
        <SponsoredSection />
        <NearestProvidersSection />
        <HottestPicksSection />
        <UpcomingTalentSection />
      </div>
      <Footer />
      <BottomNav />
      <HomeLoginHandler />
    </div>
  );
};

export default Page;
