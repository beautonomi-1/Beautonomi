import { getSupabaseServer } from "@/lib/supabase/server";
import { successResponse, handleApiError, requireRoleInApi } from "@/lib/supabase/api-helpers";
import { NextRequest } from "next/server";

/**
 * GET /api/me/profile-completion
 * 
 * Calculate profile completion percentage and checklist items
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['customer', 'provider_owner', 'provider_staff', 'superadmin'], request);
    const supabase = await getSupabaseServer(request);

    // Get user data
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("*")
      .eq("id", user.id)
      .single();

    if (userError || !userData) {
      throw new Error("User not found");
    }

    // Get profile data
    const { data: profileData } = await supabase
      .from("user_profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    // Get verification status
    const { data: verification } = await supabase
      .from("user_verifications")
      .select("status")
      .eq("user_id", user.id)
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
      .eq("user_id", user.id)
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

    return successResponse({
      completed,
      total,
      percentage,
      checklistItems,
      topItems,
    });
  } catch (error) {
    return handleApiError(error, "Failed to calculate profile completion");
  }
}
