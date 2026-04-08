"use client";

import React, { useCallback, useEffect, useRef, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import ProfileHeaderNew from "@/components/profile/ProfileHeaderNew";
import FloatingProgressOrbit from "@/components/profile/FloatingProgressOrbit";
import PersonalInfoCard from "@/components/profile/PersonalInfoCard";
import AboutSection from "@/components/profile/AboutSection";
import BeautyPreferencesCard from "@/components/profile/BeautyPreferencesCard";
import type { ProfileUser, ProfileData, CompletionData } from "@/types/profile";
import AccountHubGrid from "@/app/account-settings/components/account-hub-grid";
import { fetcher } from "@/lib/http/fetcher";

const CustomFieldsForm = dynamic(
  () =>
    import("@/components/custom-fields/CustomFieldsForm").then((m) => ({
      default: m.CustomFieldsForm,
    })),
  {
    loading: () => (
      <div
        className="rounded-xl border border-zinc-200 bg-zinc-50 p-6 animate-pulse"
        aria-hidden
      >
        <div className="h-5 w-40 bg-zinc-200 rounded mb-4" />
        <div className="h-10 w-full bg-zinc-100 rounded" />
      </div>
    ),
  }
);

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

interface ProfilePageClientProps {
  user: ProfileUser | null;
  profileData: ProfileData | null;
  completionData: CompletionData | null;
}

export default function ProfilePageClient({
  user: initialUser,
  profileData: initialProfileData,
  completionData: initialCompletionData,
}: ProfilePageClientProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [user, setUser] = useState<ProfileUser | null>(initialUser);
  const [profileData, setProfileData] = useState<ProfileData | null>(initialProfileData);
  const [completionData, setCompletionData] = useState<CompletionData | null>(
    initialCompletionData
  );
  /** Coalesce rapid onUpdate() from multiple children into one in-flight refresh. */
  const refreshPromiseRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    setUser(initialUser);
    setProfileData(initialProfileData);
    setCompletionData(initialCompletionData);
  }, [initialUser, initialProfileData, initialCompletionData]);

  const handleUpdate = useCallback(async () => {
    if (refreshPromiseRef.current) {
      return refreshPromiseRef.current;
    }
    const run = (async () => {
      try {
        const bust = `_=${Date.now()}`;
        const [profileRes, completionRes] = await Promise.all([
          fetcher.get<{ data: MeProfilePayload }>(`/api/me/profile?${bust}`, {
            staleTimeMs: 0,
          }),
          fetcher.get<{
            data: {
              completed: number;
              total: number;
              percentage: number;
              topItems: CompletionData["topItems"];
            };
          }>(`/api/me/profile-completion?${bust}`, { staleTimeMs: 0 }),
        ]);

        const raw = profileRes.data;
        if (raw) {
          const { about: _a, interests: _i, ...rest } = raw;
          setUser(rest as ProfileUser);
          setProfileData({
            about: raw.about ?? null,
            interests: normalizeInterests(raw.interests),
          });
        }

        const comp = completionRes.data;
        if (comp) {
          setCompletionData({
            completed: comp.completed,
            total: comp.total,
            percentage: comp.percentage,
            topItems: comp.topItems,
          });
        }
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
  }, [router, startTransition]);

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
      const sectionMap: Record<string, string> = {
        photo: "profile-header",
        email: "personal-info-section",
        preferred_name: "personal-info-section",
        bio: "about-section",
        identity: "personal-info-section",
        phone: "personal-info-section",
        address: "personal-info-section",
        emergency_contact: "personal-info-section",
        profile_questions: "profile-questions",
        interests: "interests-section",
        beauty_preferences: "beauty-preferences-section",
      };

      const sectionId = sectionMap[itemId];

      if (itemId === "photo") {
        const header = document.getElementById("profile-header");
        if (header) {
          header.scrollIntoView({ behavior: "auto", block: "start" });
        }
        return;
      }

      if (itemId === "profile_questions" || itemId === "interests") {
        window.location.href = "/profile/create-profile";
        return;
      }

      if (sectionId) {
        const section = document.getElementById(sectionId);
        if (section) {
          section.scrollIntoView({ behavior: "auto", block: "start" });
          openCollapsibleNearSection(section);
        }
      }
    },
    [openCollapsibleNearSection]
  );

  const handleCompleteClick = useCallback(() => {
    if (completionData?.topItems && completionData.topItems.length > 0) {
      const firstItem = completionData.topItems[0];
      handleItemClick(firstItem.id);
    } else {
      window.location.href = "/profile/complete";
    }
  }, [completionData?.topItems, handleItemClick]);

  if (!user) {
    return (
      <div className="text-center py-12">
        <p className="text-zinc-600">Unable to load profile. Please try refreshing the page.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div id="profile-header">
        <ProfileHeaderNew user={user} onUpdate={handleUpdate} />
      </div>

      {completionData && completionData.percentage < 100 && (
        <FloatingProgressOrbit
          completionData={completionData}
          onCompleteClick={handleCompleteClick}
          onItemClick={handleItemClick}
        />
      )}

      <div id="personal-info-section">
        <PersonalInfoCard user={user} onUpdate={handleUpdate} />
      </div>

      {profileData && (
        <div id="about-section">
          <AboutSection about={profileData.about} />
        </div>
      )}

      <div id="beauty-preferences-section">
        <BeautyPreferencesCard
          preferences={user.beauty_preferences || {}}
          onUpdate={handleUpdate}
        />
      </div>

      <div id="custom-fields-section" className="rounded-xl border border-zinc-200 bg-white p-4 md:p-6">
        <h3 className="text-lg font-semibold text-zinc-900 mb-2">Additional details</h3>
        <p className="text-sm text-zinc-500 mb-4">
          Extra information the platform may ask for (e.g. skin type, accessibility needs).
        </p>
        <CustomFieldsForm entityType="user" entityId={user.id} showSaveButton={true} />
      </div>

      <AccountHubGrid embeddedInProfile />
    </div>
  );
}
