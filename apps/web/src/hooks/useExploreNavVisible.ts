"use client";

import { useAuth } from "@/providers/AuthProvider";
import { useFeatureFlag } from "@/providers/ConfigBundleProvider";
import { FEATURE_FLAG_KEYS } from "@/lib/server/feature-flag-keys";
import { shouldShowExploreNav } from "@/lib/explore/explore-visibility";
import { useViewerSafetySettings } from "@/hooks/useViewerSafetySettings";

/** Customer web + mobile-aligned Explore nav visibility (feature flag + safety). */
export function useExploreNavVisible(): boolean {
  const exploreFlag = useFeatureFlag(FEATURE_FLAG_KEYS.EXPLORE_ENABLED);
  const { user } = useAuth();
  const { hide_social_feed, age_band, loading } = useViewerSafetySettings(user?.id ?? null);

  return shouldShowExploreNav({
    flagEnabled: exploreFlag,
    signedIn: !!user,
    hideSocialFeed: loading ? false : hide_social_feed,
    ageBand: loading ? "18_plus" : age_band,
  });
}
