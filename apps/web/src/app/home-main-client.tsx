"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import dynamic from "next/dynamic";
import { useAmplitude } from "@/hooks/useAmplitude";
import { EVENT_HOME_VIEW } from "@/lib/analytics/amplitude/types";
import TopRatedSection from "./home/components/top-rated-section";
import HomeLoginHandler from "./home-login-handler";

const Footer = dynamic(
  () => import("@/components/layout/footer"),
  { ssr: false }
);
const BottomNav = dynamic(
  () => import("@/components/layout/bottom-nav"),
  { ssr: false }
);
import type { HomePageInitialData } from "@/app/home/home-initial-types";
import type { PublicFooterInitial } from "@/types/public-footer-initial";

const NearestProvidersSection = dynamic(
  () => import("./home/components/nearest-providers-section"),
  { ssr: false }
);
const HottestPicksSection = dynamic(
  () => import("./home/components/hottest-picks-section"),
  { ssr: false }
);
const SponsoredSection = dynamic(
  () => import("./home/components/sponsored-section"),
  { ssr: false }
);
const UpcomingTalentSection = dynamic(
  () => import("./home/components/upcoming-talent-section"),
  { ssr: false }
);

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

  useEffect(() => {
    const dc = searchParams.get("deletion_cancel");
    if (dc === "success") {
      toast.success("Account deletion cancelled. You can sign in again with your existing credentials.", {
        duration: 5000,
      });
      window.history.replaceState({}, "", "/");
    } else if (dc === "invalid" || dc === "stale" || dc === "not_pending") {
      toast.error("That cancellation link is invalid or has expired.");
      window.history.replaceState({}, "", "/");
    } else if (dc === "error") {
      toast.error("We could not cancel your deletion request. Contact support.");
      window.history.replaceState({}, "", "/");
    }
  }, [searchParams]);

  useEffect(() => {
    if (searchParams.get("deletion_scheduled") === "1") {
      toast.message(
        "Your account is scheduled for permanent deletion. Check your email for a link to cancel, or contact support.",
        { duration: 6000 },
      );
      window.history.replaceState({}, "", "/");
    }
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
          categorySlug={selectedCategory}
          initialProviders={initialHomeData?.topRated}
          initialHydrated={initialHydrated}
        />
        <SponsoredSection
          categorySlug={selectedCategory}
          initialProviders={initialHomeData?.sponsored}
          initialHydrated={initialHydrated}
        />
        <NearestProvidersSection
          categorySlug={selectedCategory}
          initialProviders={initialHomeData?.nearest}
          initialHydrated={initialHydrated}
        />
        <HottestPicksSection
          categorySlug={selectedCategory}
          initialProviders={initialHomeData?.hottest}
          initialHydrated={initialHydrated}
        />
        <UpcomingTalentSection
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
