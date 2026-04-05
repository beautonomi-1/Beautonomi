"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { useAmplitude } from "@/hooks/useAmplitude";
import { EVENT_HOME_VIEW } from "@/lib/analytics/amplitude/types";
import TopRatedSection from "./home/components/top-rated-section";
import NearestProvidersSection from "./home/components/nearest-providers-section";
import HottestPicksSection from "./home/components/hottest-picks-section";
import SponsoredSection from "./home/components/sponsored-section";
import UpcomingTalentSection from "./home/components/upcoming-talent-section";
import Footer from "@/components/layout/footer";
import BottomNav from "@/components/layout/bottom-nav";
import HomeLoginHandler from "./home-login-handler";
import type { HomePageInitialData } from "@/app/home/home-initial-types";
import type { PublicFooterInitial } from "@/types/public-footer-initial";

/**
 * Home body that depends on `useSearchParams` — keep under `<Suspense>` in `page.tsx`
 * so the shell (header + h1) hydrates without Next/searchParams streaming mismatches.
 */
export default function HomeMainClient({
  initialHomeData,
  initialHomeError,
  initialFooter,
}: {
  initialHomeData: HomePageInitialData | null;
  initialHomeError: string | null;
  initialFooter?: PublicFooterInitial;
}) {
  const searchParams = useSearchParams();
  const { track, isReady } = useAmplitude();
  const [showRetentionKeptBanner, setShowRetentionKeptBanner] = useState(false);
  const [retentionKeptBannerDismissed, setRetentionKeptBannerDismissed] = useState(false);
  const selectedCategory = searchParams.get("category") || "all";
  const initialHydrated = Boolean(initialHomeData) && !initialHomeError;

  useEffect(() => {
    if (isReady) {
      track(EVENT_HOME_VIEW);
    }
  }, [isReady, track]);

  useEffect(() => {
    if (searchParams.get("onboarded") === "true") {
      toast.success("Welcome to Beautonomi! Start exploring beauty services.", {
        duration: 5000,
      });
      window.history.replaceState({}, "", "/");
    }
  }, [searchParams]);

  useEffect(() => {
    const r = searchParams.get("retention");
    if (!r) return;
    if (r === "kept") {
      setShowRetentionKeptBanner(true);
      toast.success("Your account stays active. Thanks for staying with Beautonomi.", { duration: 4000 });
    } else if (r === "invalid") {
      toast.error("That link is invalid or has expired.");
    } else if (r === "used") {
      toast.message("This confirmation link was already used or is out of date.", { duration: 4000 });
    } else if (r === "error") {
      toast.error("We couldn’t update your account. Try again or sign in.");
    }
    window.history.replaceState({}, "", "/");
  }, [searchParams]);

  const isDeactivated = searchParams.get("deactivated") === "true";

  return (
    <>
      {showRetentionKeptBanner && !retentionKeptBannerDismissed && (
        <div className="bg-emerald-50 border-b border-emerald-200 px-4 py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <p className="text-sm text-emerald-900 text-center sm:text-left flex-1">
            You&apos;re all set — your account will stay active. Thanks for confirming.
          </p>
          <button
            type="button"
            onClick={() => setRetentionKeptBannerDismissed(true)}
            className="text-sm font-medium text-emerald-800 underline hover:no-underline self-center sm:self-auto shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}
      {isDeactivated && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-3 text-center text-sm text-amber-900">
          You deactivated your account.{" "}
          <a href="/reactivate" className="font-medium underline hover:no-underline">
            Reactivate your account
          </a>
          {" "}
          or{" "}
          <a href="/login?redirect=/" className="font-medium underline hover:no-underline">
            log in again
          </a>
          .
        </div>
      )}
      <div className="pt-4 md:pt-6 w-full max-w-full overflow-x-hidden">
        <TopRatedSection
          key={`top-rated-${selectedCategory}`}
          categorySlug={selectedCategory}
          initialProviders={initialHomeData?.topRated}
          initialHydrated={initialHydrated}
        />
        <SponsoredSection
          key={`sponsored-${selectedCategory}`}
          categorySlug={selectedCategory}
          initialProviders={initialHomeData?.sponsored}
          initialHydrated={initialHydrated}
        />
        <NearestProvidersSection
          key={`nearest-${selectedCategory}`}
          categorySlug={selectedCategory}
          initialProviders={initialHomeData?.nearest}
          initialHydrated={initialHydrated}
        />
        <HottestPicksSection
          key={`hottest-${selectedCategory}`}
          categorySlug={selectedCategory}
          initialProviders={initialHomeData?.hottest}
          initialHydrated={initialHydrated}
        />
        <UpcomingTalentSection
          key={`upcoming-${selectedCategory}`}
          categorySlug={selectedCategory}
          initialProviders={initialHomeData?.upcoming}
          initialHydrated={initialHydrated}
        />
      </div>
      <Footer initialFooter={initialFooter} />
      <BottomNav />
      <HomeLoginHandler />
    </>
  );
}
