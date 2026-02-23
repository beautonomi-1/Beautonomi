"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import ProfileHeaderNew from "@/components/profile/ProfileHeaderNew";
import FloatingProgressOrbit from "@/components/profile/FloatingProgressOrbit";
import PersonalInfoCard from "@/components/profile/PersonalInfoCard";
import AboutSection from "@/components/profile/AboutSection";
import BeautyPreferencesCard from "@/components/profile/BeautyPreferencesCard";
import { CustomFieldsForm } from "@/components/custom-fields/CustomFieldsForm";
import type { ProfileUser, ProfileData, CompletionData } from "@/types/profile";

interface ProfilePageClientProps {
  user: ProfileUser | null;
  profileData: ProfileData | null;
  completionData: CompletionData | null;
}

export default function ProfilePageClient({
  user,
  profileData,
  completionData,
}: ProfilePageClientProps) {
  const router = useRouter();
  const [_isPending, startTransition] = useTransition();
  const [_refreshKey, setRefreshKey] = useState(0);

  const handleUpdate = () => {
    setRefreshKey((prev) => prev + 1);
    startTransition(() => {
      router.refresh();
    });
  };

  const handleItemClick = (itemId: string) => {
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
        header.scrollIntoView({ behavior: "smooth", block: "start" });
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
        section.scrollIntoView({ behavior: "smooth", block: "start" });
        // Open collapsible if closed
        setTimeout(() => {
          const trigger = section.closest('[data-state]') as HTMLElement;
          if (trigger && trigger.getAttribute("data-state") === "closed") {
            trigger.click();
          }
        }, 300);
      }
    }
  };

  const handleCompleteClick = () => {
    if (completionData?.topItems && completionData.topItems.length > 0) {
      const firstItem = completionData.topItems[0];
      handleItemClick(firstItem.id);
    } else {
      window.location.href = "/profile/complete";
    }
  };

  if (!user) {
    return (
      <div className="text-center py-12">
        <p className="text-zinc-600">Unable to load profile. Please try refreshing the page.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Profile Header */}
      <div id="profile-header">
        <ProfileHeaderNew user={user} onUpdate={handleUpdate} />
      </div>

      {/* Profile Strength + Tasks */}
      {completionData && completionData.percentage < 100 && (
        <FloatingProgressOrbit
          completionData={completionData}
          onCompleteClick={handleCompleteClick}
          onItemClick={handleItemClick}
        />
      )}

      {/* Personal Information */}
      <div id="personal-info-section">
        <PersonalInfoCard user={user} onUpdate={handleUpdate} />
      </div>

      {/* About Section */}
      {profileData && (
        <div id="about-section">
          <AboutSection about={profileData.about} />
        </div>
      )}

      {/* Beauty Preferences */}
      <div id="beauty-preferences-section">
        <BeautyPreferencesCard
          preferences={user.beauty_preferences || {}}
          onUpdate={handleUpdate}
        />
      </div>

      {/* Platform custom fields (e.g. preferences, notes) */}
      <div id="custom-fields-section" className="rounded-xl border border-zinc-200 bg-white p-4 md:p-6">
        <h3 className="text-lg font-semibold text-zinc-900 mb-2">Additional details</h3>
        <p className="text-sm text-zinc-500 mb-4">
          Extra information the platform may ask for (e.g. skin type, accessibility needs).
        </p>
        <CustomFieldsForm
          entityType="user"
          entityId={user.id}
          showSaveButton={true}
        />
      </div>
    </div>
  );
}
