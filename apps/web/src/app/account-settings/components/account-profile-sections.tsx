"use client";

import React, { memo, useCallback, useEffect, useRef, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import ProfileHeaderNew from "@/components/profile/ProfileHeaderNew";
import FloatingProgressOrbit from "@/components/profile/FloatingProgressOrbit";
import PersonalInfoCard from "@/components/profile/PersonalInfoCard";
import AboutSection from "@/components/profile/AboutSection";
import BeautyPreferencesCard from "@/components/profile/BeautyPreferencesCard";
import type { ProfileUser, ProfileData, CompletionData } from "@/types/profile";
import { fetcher, clearFetcherCache } from "@/lib/http/fetcher";
import {
  getCompletionHref,
  isPersonalInfoFocusParam,
} from "@/lib/profile/completion-deeplinks";

const CustomFieldsForm = dynamic(
  () =>
    import("@/components/custom-fields/CustomFieldsForm").then((m) => ({
      default: m.CustomFieldsForm,
    })),
  {
    loading: () => (
      <div className="rounded-xl border border-gray-100 bg-gray-50/80 p-5 animate-pulse" aria-hidden>
        <div className="h-4 w-36 bg-gray-200/80 rounded mb-3" />
        <div className="h-9 w-full bg-gray-100 rounded" />
      </div>
    ),
  }
);

// ── Stable memoised wrappers ──────────────────────────────────────────────────
// Prevents child components from re-rendering when only unrelated state
// (e.g. completionData) changes. These components are heavy (forms, modals).

const MemoProfileHeader = memo(ProfileHeaderNew);
MemoProfileHeader.displayName = "MemoProfileHeader";

const MemoPersonalInfoCard = memo(PersonalInfoCard);
MemoPersonalInfoCard.displayName = "MemoPersonalInfoCard";

const MemoBeautyPreferencesCard = memo(BeautyPreferencesCard);
MemoBeautyPreferencesCard.displayName = "MemoBeautyPreferencesCard";

const MemoAboutSection = memo(AboutSection);
MemoAboutSection.displayName = "MemoAboutSection";

// ─────────────────────────────────────────────────────────────────────────────

function normalizeInterests(raw: unknown): string[] | null {
  if (raw == null) return null;
  if (Array.isArray(raw)) {
    const strings = raw.filter((x): x is string => typeof x === "string");
    return strings.length ? strings : null;
  }
  return null;
}

type MeProfilePayload = ProfileUser & {
  about?: string | null;
  interests?: unknown;
};

type ProfileBundle = {
  profile: MeProfilePayload;
  completion: {
    completed: number;
    total: number;
    percentage: number;
    topItems: CompletionData["topItems"];
  };
  loyalty_points: number;
};

const SECTION_QUERY_TO_ID: Record<string, string> = {
  photo: "profile-header",
  email: "personal-info-section",
  preferred_name: "personal-info-section",
  bio: "about-section",
  identity: "personal-info-section",
  phone: "personal-info-section",
  address: "personal-info-section",
  emergency_contact: "personal-info-section",
  profile_questions: "about-section",
  interests: "about-section",
  beauty_preferences: "beauty-preferences-section",
};

// Stale time: 30 s. Profile data only changes when the user explicitly saves.
// After a save, we call clearFetcherCache() so the next read is fresh.
const PROFILE_STALE_MS = 30_000;

export default function AccountProfileSections() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [user, setUser] = useState<ProfileUser | null>(null);
  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [completionData, setCompletionData] = useState<CompletionData | null>(null);
  const [loyaltyPoints, setLoyaltyPoints] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const refreshPromiseRef = useRef<Promise<void> | null>(null);

  const applyBundle = useCallback((bundle: ProfileBundle) => {
    const { profile: raw, completion: comp, loyalty_points: pts } = bundle;

    if (raw) {
      const { about: _a, interests: _i, ...rest } = raw;
      setUser(rest as ProfileUser);
      setProfileData({
        about: raw.about ?? null,
        interests: normalizeInterests(raw.interests),
      });
    }

    if (comp) {
      setCompletionData({
        completed: comp.completed,
        total: comp.total,
        percentage: comp.percentage,
        topItems: comp.topItems,
      });
    }

    setLoyaltyPoints(typeof pts === "number" ? pts : null);
  }, []);

  const pullBundle = useCallback(async (forceRefresh = false) => {
    // When forcing a refresh after a save, clear the in-memory cache so we
    // don't serve stale data. The browser HTTP cache will also be bypassed
    // because we pass cache: "no-cache" via the fetchOptions below.
    if (forceRefresh) {
      clearFetcherCache();
    }

    const res = await fetcher.get<{ data: ProfileBundle }>(
      "/api/me/profile-bundle",
      { staleTimeMs: forceRefresh ? 0 : PROFILE_STALE_MS }
    );

    applyBundle(res.data);
  }, [applyBundle]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        await pullBundle();
      } catch {
        if (!cancelled) {
          startTransition(() => {
            router.refresh();
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleUpdate = useCallback(async () => {
    if (refreshPromiseRef.current) {
      return refreshPromiseRef.current;
    }
    const run = (async () => {
      try {
        // Force-refresh after user explicitly saved something.
        await pullBundle(true);
      } catch {
        startTransition(() => {
          router.refresh();
        });
      } finally {
        refreshPromiseRef.current = null;
      }
    })();
    refreshPromiseRef.current = run;
    return run;
  }, [pullBundle, router, startTransition]);

  const openCollapsibleNearSection = useCallback((section: HTMLElement) => {
    requestAnimationFrame(() => {
      const trigger = section.closest("[data-state]") as HTMLElement | null;
      if (trigger && trigger.getAttribute("data-state") === "closed") {
        trigger.click();
      }
    });
  }, []);

  const handleItemClick = useCallback(
    (itemId: string) => {
      router.push(getCompletionHref(itemId));
    },
    [router]
  );

  const handleCompleteClick = useCallback(() => {
    if (completionData?.topItems?.length) {
      router.push(getCompletionHref(completionData.topItems[0].id));
    } else {
      router.push("/profile/complete");
    }
  }, [completionData?.topItems, router]);

  const focusParam = searchParams.get("focus");
  const personalInfoCompletionFocus = isPersonalInfoFocusParam(focusParam)
    ? focusParam
    : null;

  const stripFocusFromUrl = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("focus");
    const qs = params.toString();
    const hash = typeof window !== "undefined" ? window.location.hash : "";
    router.replace(`${pathname}${qs ? `?${qs}` : ""}${hash}`, { scroll: false });
  }, [router, pathname, searchParams]);

  useEffect(() => {
    if (loading || !user) return;

    const scrollToId = (id: string) => {
      requestAnimationFrame(() => {
        const el = document.getElementById(id);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
          openCollapsibleNearSection(el);
        }
      });
    };

    if (searchParams.get("focus")) {
      scrollToId("personal-info-section");
      return;
    }

    const q = searchParams.get("section");
    if (q && SECTION_QUERY_TO_ID[q]) {
      scrollToId(SECTION_QUERY_TO_ID[q]);
      return;
    }

    if (typeof window === "undefined") return;
    const hash = window.location.hash.slice(1);
    if (hash) {
      scrollToId(hash);
    }
  }, [loading, user, searchParams, openCollapsibleNearSection]);

  if (loading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <div className="rounded-2xl border border-gray-100 bg-gray-50/90 p-6 md:p-8 animate-pulse min-h-[10rem]" />
        <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-5 h-20 animate-pulse" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="text-center py-8 rounded-xl border border-gray-100 bg-gray-50/50">
        <p className="text-gray-600 text-sm">Unable to load your profile. Please refresh the page.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5 md:space-y-6">
      <div id="profile-header">
        <MemoProfileHeader
          user={user}
          onUpdate={handleUpdate}
          prefetchedLoyaltyPoints={loyaltyPoints}
        />
      </div>

      {completionData && completionData.percentage < 100 && (
        <FloatingProgressOrbit
          completionData={completionData}
          onCompleteClick={handleCompleteClick}
          onItemClick={handleItemClick}
        />
      )}

      <div id="personal-info-section">
        <MemoPersonalInfoCard
          user={user}
          onUpdate={handleUpdate}
          completionFocus={personalInfoCompletionFocus}
          onCompletionFocusConsumed={stripFocusFromUrl}
        />
      </div>

      {profileData && (
        <div id="about-section">
          <MemoAboutSection about={profileData.about} />
        </div>
      )}

      <div id="beauty-preferences-section">
        <MemoBeautyPreferencesCard
          preferences={user.beauty_preferences || {}}
          onUpdate={handleUpdate}
        />
      </div>

      <div
        id="custom-fields-section"
        className="rounded-xl border border-gray-100 bg-white p-4 md:p-6 shadow-sm"
      >
        <h3 className="text-base font-semibold text-gray-900 mb-1">Additional details</h3>
        <p className="text-sm text-gray-500 mb-4">
          Optional fields the platform may use (e.g. skin type, accessibility).
        </p>
        <CustomFieldsForm entityType="user" entityId={user.id} showSaveButton={true} />
      </div>
    </div>
  );
}
