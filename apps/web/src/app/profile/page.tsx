import React from "react";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRole } from "@/lib/supabase/auth-server";
import AuthGuard from "@/components/auth/auth-guard";
import ProfilePageClient from "./components/ProfilePageClient";
import type { ProfileUser, ProfileData, CompletionData } from "@/types/profile";
import Breadcrumb from "@/components/ui/breadcrumb";
import BottomNav from "@/components/layout/bottom-nav";
import BackButton from "@/app/account-settings/components/back-button";

export const dynamic = "force-dynamic";

async function calculateCompletionData(
  supabase: any,
  userId: string,
  userData: any,
  profileData: any
): Promise<CompletionData> {
  // Get verification status
  const { data: verification } = await supabase
    .from("user_verifications")
    .select("status")
    .eq("user_id", userId)
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Calculate completion for each item
  const checklistItems = [
    {
      id: "photo",
      label: "Add profile photo",
      timeEstimate: "30 sec",
      completed: !!userData.avatar_url,
      required: false,
    },
    {
      id: "email",
      label: "Verify email",
      timeEstimate: "1 min",
      completed: userData.email_verified || false,
      required: true,
    },
    {
      id: "preferred_name",
      label: "Add preferred name",
      timeEstimate: "30 sec",
      completed: !!userData.preferred_name,
      required: false,
    },
    {
      id: "bio",
      label: "Add bio",
      timeEstimate: "2 min",
      completed: !!(profileData?.about),
      required: false,
    },
    {
      id: "identity",
      label: "Verify identity",
      timeEstimate: "5 min",
      completed: verification?.status === "approved",
      required: false,
    },
    {
      id: "phone",
      label: "Add phone",
      timeEstimate: "1 min",
      completed: !!userData.phone,
      required: false,
    },
    {
      id: "address",
      label: "Add address",
      timeEstimate: "2 min",
      completed: false, // Will check address separately
      required: false,
    },
    {
      id: "emergency_contact",
      label: "Add emergency contact",
      timeEstimate: "1 min",
      completed: !!userData.emergency_contact_name,
      required: false,
    },
    {
      id: "profile_questions",
      label: "Answer 3 profile questions",
      timeEstimate: "3 min",
      completed: false, // Will calculate separately
      required: false,
    },
    {
      id: "interests",
      label: "Add interests",
      timeEstimate: "1 min",
      completed: !!(profileData?.interests && profileData.interests.length > 0),
      required: false,
    },
    {
      id: "beauty_preferences",
      label: "Add beauty preferences",
      timeEstimate: "3 min",
      completed: false, // Will check beauty preferences
      required: false,
    },
  ];

  // Check address
  const { data: address } = await supabase
    .from("user_addresses")
    .select("id")
    .eq("user_id", userId)
    .eq("is_default", true)
    .maybeSingle();
  
  checklistItems[6].completed = !!address;

  // Check profile questions (at least 3 answered)
  const answeredQuestions = profileData ? [
    profileData.school,
    profileData.work,
    profileData.location,
    profileData.decade_born,
    profileData.favorite_song,
    profileData.obsessed_with,
    profileData.fun_fact,
    profileData.useless_skill,
    profileData.biography_title,
    profileData.spend_time,
    profileData.pets,
  ].filter(Boolean).length : 0;
  
  checklistItems[8].completed = answeredQuestions >= 3;

  // Check beauty preferences (at least one field filled)
  const beautyPrefs = profileData?.beauty_preferences || {};
  const hasBeautyPrefs = Object.keys(beautyPrefs).some(key => {
    const value = beautyPrefs[key];
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'string') return value.trim().length > 0;
    return !!value;
  });
  checklistItems[10].completed = hasBeautyPrefs;

  // Calculate totals
  const completed = checklistItems.filter(item => item.completed).length;
  const total = checklistItems.length;
  const percentage = Math.round((completed / total) * 100);

  // Get top 3 incomplete items
  const topItems = checklistItems
    .filter(item => !item.completed)
    .slice(0, 3);

  return {
    completed,
    total,
    percentage,
    topItems,
  };
}

async function getProfileData(): Promise<{
  user: ProfileUser | null;
  profileData: ProfileData | null;
  completionData: CompletionData | null;
}> {
  try {
    const { user } = await requireRole(['customer', 'provider_owner', 'provider_staff', 'superadmin']);
    const supabase = await getSupabaseServer();

    // Fetch all data in parallel
    const [userResult, profileResult] = await Promise.allSettled([
      // User profile
      supabase
        .from("users")
        .select("*")
        .eq("id", user.id)
        .single(),
      // Profile data (about, interests, beauty_preferences)
      supabase
        .from("user_profiles")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);

    // Process user data
    let userData: ProfileUser | null = null;
    if (userResult.status === "fulfilled" && userResult.value.data) {
      const user = userResult.value.data;
      
      // Get address
      const { data: address } = await supabase
        .from("user_addresses")
        .select("*")
        .eq("user_id", user.id)
        .eq("is_default", true)
        .maybeSingle();

      // Get verification
      const { data: verification } = await supabase
        .from("user_verifications")
        .select("id, status, submitted_at, rejection_reason, document_url, document_type, country")
        .eq("user_id", user.id)
        .order("submitted_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      // Get profile preferences
      const { data: profilePrefs } = await supabase
        .from("user_profiles")
        .select("beauty_preferences, privacy_settings")
        .eq("user_id", user.id)
        .maybeSingle();

      // Parse full_name
      const fullName = user.full_name || "";
      const nameParts = fullName.trim().split(/\s+/);
      const first_name = nameParts[0] || "";
      const last_name = nameParts.slice(1).join(" ") || "";

      // Only show pending if there's actually a submitted verification
      // If no verification record exists or it hasn't been submitted, show as 'none'
      let verificationStatus = 'none';
      if (verification?.submitted_at) {
        verificationStatus = verification.status || 'none';
      } else if ((user as any).identity_verification_status && (user as any).identity_verification_status !== 'none') {
        // Fallback to user table status only if it's not 'none'
        verificationStatus = (user as any).identity_verification_status;
      }

      userData = {
        ...user,
        first_name,
        last_name,
        preferred_name: (user as any).preferred_name || null,
        handle: (user as any).handle || null,
        email_verified: (user as any).email_verified || false,
        phone_verified: (user as any).phone_verified || false,
        address: address ? {
          country: address.country || "",
          line1: address.address_line1 || "",
          line2: address.address_line2 || "",
          city: address.city || "",
          state: address.state || "",
          postal_code: address.postal_code || "",
        } : null,
        emergency_contact: {
          name: user.emergency_contact_name || "",
          relationship: user.emergency_contact_relationship || "",
          language: user.preferred_language || "",
          email: (user as any).emergency_contact_email || "",
          country_code: (user as any).emergency_contact_country_code || "",
          phone: user.emergency_contact_phone || "",
        },
        identity_verified: verificationStatus === 'approved',
        identity_verification_status: verificationStatus,
        identity_verification_submitted_at: verification?.submitted_at || null,
        identity_verification_rejection_reason: verification?.rejection_reason || null,
        identity_verification_document_url: verification?.document_url || null,
        identity_verification_document_type: verification?.document_type || null,
        identity_verification_id: verification?.id || null,
        beauty_preferences: profilePrefs?.beauty_preferences || {},
        privacy_settings: profilePrefs?.privacy_settings || { services_booked_visible: false },
      } as ProfileUser;
    }

    // Process profile data
    let profileData: ProfileData | null = null;
    let fullProfileData: any = null;
    if (profileResult.status === "fulfilled" && profileResult.value.data) {
      fullProfileData = profileResult.value.data;
      profileData = {
        about: fullProfileData.about || null,
        interests: fullProfileData.interests || null,
      };
    }

    // Calculate completion data
    let completionData: CompletionData | null = null;
    if (userResult.status === "fulfilled" && userResult.value.data) {
      completionData = await calculateCompletionData(
        supabase,
        user.id,
        userResult.value.data,
        fullProfileData
      );
    }

    return {
      user: userData,
      profileData,
      completionData,
    };
  } catch (error) {
    console.error("Error fetching profile data:", error);
    return {
      user: null,
      profileData: null,
      completionData: null,
    };
  }
}

export default async function ProfilePage() {
  const { user, profileData, completionData } = await getProfileData();

  return (
    <AuthGuard>
      <div className="min-h-screen bg-zinc-50/50 pb-20 md:pb-0">
        {/* Mobile Back Button */}
        <div className="md:hidden px-4 pt-4">
          <BackButton href="/" />
        </div>
        
        {/* Breadcrumb - Desktop only */}
        <div className="hidden md:block max-w-5xl mx-auto px-4 md:px-6 lg:px-8 pt-4 md:pt-6">
          <Breadcrumb 
            items={[
              { label: "Home", href: "/" },
              { label: "Profile" }
            ]} 
          />
        </div>
        
        <div className="max-w-5xl mx-auto p-4 md:p-6 lg:p-8 space-y-6">
          <ProfilePageClient
            user={user}
            profileData={profileData}
            completionData={completionData}
          />
        </div>
        
        {/* Bottom Navigation - Mobile only */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-50">
          <BottomNav />
        </div>
      </div>
    </AuthGuard>
  );
}
