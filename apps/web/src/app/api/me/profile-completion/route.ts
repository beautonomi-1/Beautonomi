import { getSupabaseServer } from "@/lib/supabase/server";
import { successResponse, handleApiError, requireRoleInApi } from "@/lib/supabase/api-helpers";
import { NextRequest } from "next/server";
import { bootstrapPreferredHomeTenantForAuthedUser } from "@/lib/tenant/assign-preferred-home-tenant-from-host";

/**
 * GET /api/me/profile-completion
 * 
 * Calculate profile completion percentage and checklist items
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['customer', 'provider_owner', 'provider_staff', 'superadmin'], request);
    const supabase = await getSupabaseServer(request);

    await bootstrapPreferredHomeTenantForAuthedUser(user.id, request);

    // Auth user for email_confirmed_at (Supabase verification state)
    const { data: { user: authUser } } = await supabase.auth.getUser();

    // Get user data
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("*")
      .eq("id", user.id)
      .single();

    if (userError || !userData) {
      throw new Error("User not found");
    }

    const emailVerified = userData.email_verified || !!(authUser as { email_confirmed_at?: string } | undefined)?.email_confirmed_at;
    const hasPreferredOrFullName = !!(userData.preferred_name || (userData as { full_name?: string }).full_name);
    // Phone can be in users.phone (from account settings) or in Auth (e.g. phone sign-in)
    const authPhone = (authUser as { phone?: string; user_metadata?: { phone?: string } })?.phone
      || (authUser as { user_metadata?: { phone?: string } })?.user_metadata?.phone;
    const hasPhone = !!(userData.phone || authPhone);

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
    const isCustomer = user.role === "customer";
    // Email from auth.users (covers OAuth, email-password and email-OTP signups)
    const authEmail =
      (authUser as { email?: string | null } | null)?.email?.trim() || null;
    // Only gate on email verification when the account actually HAS an email to verify.
    // Phone-only (SMS OTP) signups never set an email address; marking email as
    // required=true for them would permanently block them at the profile-completion
    // gate on every cold start since they can never satisfy the check.
    const hasEmail = !!(userData.email || authEmail);

    const checklistItems = [
      {
        id: "photo",
        label: "Add profile photo",
        timeEstimate: "30 sec",
        completed: !!userData.avatar_url,
        // Photo is skippable in the onboarding wizard (step 2). Making it a required
        // gate item would redirect users to personal-info on every cold start after
        // they skipped it — a confusing loop with no clear recovery path.
        required: false,
      },
      {
        id: "email",
        label: "Verify email",
        timeEstimate: "1 min",
        completed: emailVerified,
        // Only required when the account has an email address to verify.
        required: hasEmail,
      },
      {
        id: "preferred_name",
        label: "Add preferred name",
        timeEstimate: "30 sec",
        completed: hasPreferredOrFullName,
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
        completed: Boolean(userData.identity_verified),
        required: false,
      },
      {
        id: "phone",
        label: "Add phone",
        timeEstimate: "1 min",
        completed: hasPhone,
        required: isCustomer,
      },
      {
        id: "address",
        label: "Add address",
        timeEstimate: "2 min",
        completed: false, // Will check address separately
        required: isCustomer,
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

    // Check address: having at least one saved address counts as complete (no need to mark default)
    const { data: addressRow } = await supabase
      .from("user_addresses")
      .select("id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();
    
    checklistItems[6].completed = !!addressRow;

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

    const res = successResponse({
      completed,
      total,
      percentage,
      checklistItems,
      topItems,
      avatar_url: userData.avatar_url ?? null,
    });
    res.headers.set("Cache-Control", "private, max-age=30, stale-while-revalidate=60");
    return res;
  } catch (error) {
    return handleApiError(error, "Failed to calculate profile completion");
  }
}
