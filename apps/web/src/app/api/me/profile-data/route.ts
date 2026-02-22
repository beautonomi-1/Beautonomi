import { getSupabaseServer } from "@/lib/supabase/server";
import { successResponse, handleApiError, requireRoleInApi } from "@/lib/supabase/api-helpers";
import { NextRequest } from "next/server";

/**
 * GET /api/me/profile-data
 * 
 * Get current user's extended profile data (profile questions)
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['customer', 'provider_owner', 'provider_staff', 'superadmin'], request);
    const supabase = await getSupabaseServer();

    const { data: profileData, error } = await supabase
      .from("user_profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle(); // Use maybeSingle instead of single to avoid errors if no profile exists

    if (error) {
      // Only throw if it's not a "no rows" error
      if (error.code !== 'PGRST116') {
        throw error;
      }
      // If no profile exists, return null
      return successResponse(null);
    }

    return successResponse(profileData || null);
  } catch (error) {
    return handleApiError(error, "Failed to fetch profile data");
  }
}

/**
 * POST /api/me/profile-data
 * 
 * Create or update current user's extended profile data
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['customer', 'provider_owner', 'provider_staff', 'superadmin'], request);
    const supabase = await getSupabaseServer();
    const body = await request.json();

    const {
      avatar_url,
      about,
      school,
      work,
      location,
      languages,
      decade_born,
      favorite_song,
      obsessed_with,
      fun_fact,
      useless_skill,
      biography_title,
      spend_time,
      pets,
      interests,
      travel_destinations,
      show_travel_history,
    } = body;

    // Check if profile exists
    const { data: existingProfile, error: checkError } = await supabase
      .from("user_profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (checkError && checkError.code !== 'PGRST116') {
      throw checkError;
    }

    const profileData: Record<string, unknown> = {
      user_id: user.id,
      // updated_at is handled by database trigger
    };

    // Only include fields that are provided
    // Handle null values explicitly - convert null to null, but allow empty arrays
    if (avatar_url !== undefined) profileData.avatar_url = avatar_url;
    if (about !== undefined) profileData.about = about;
    if (school !== undefined) profileData.school = school;
    if (work !== undefined) profileData.work = work;
    if (location !== undefined) profileData.location = location;
    if (languages !== undefined) profileData.languages = languages || [];
    if (decade_born !== undefined) profileData.decade_born = decade_born;
    if (favorite_song !== undefined) profileData.favorite_song = favorite_song;
    if (obsessed_with !== undefined) profileData.obsessed_with = obsessed_with;
    if (fun_fact !== undefined) profileData.fun_fact = fun_fact;
    if (useless_skill !== undefined) profileData.useless_skill = useless_skill;
    if (biography_title !== undefined) profileData.biography_title = biography_title;
    if (spend_time !== undefined) profileData.spend_time = spend_time;
    if (pets !== undefined) profileData.pets = pets;
    if (interests !== undefined) profileData.interests = interests || [];
    if (travel_destinations !== undefined) profileData.travel_destinations = travel_destinations || [];
    if (show_travel_history !== undefined) profileData.show_travel_history = show_travel_history;

    let result;
    if (existingProfile) {
      // Update existing profile
      const { data, error } = await supabase
        .from("user_profiles")
        .update(profileData)
        .eq("user_id", user.id)
        .select()
        .single();
      
      if (error) {
        console.error("Error updating profile:", error);
        throw error;
      }
      result = data;
    } else {
      // Create new profile
      const { data, error } = await supabase
        .from("user_profiles")
        .insert(profileData)
        .select()
        .single();
      
      if (error) {
        console.error("Error creating profile:", error);
        throw error;
      }
      result = data;
    }

    // Also update avatar_url in users table if provided
    if (avatar_url !== undefined) {
      await supabase
        .from("users")
        .update({ avatar_url })
        .eq("id", user.id);
    }

    return successResponse(result);
  } catch (error) {
    return handleApiError(error, "Failed to save profile data");
  }
}
