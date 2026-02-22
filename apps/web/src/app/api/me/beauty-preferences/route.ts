import { getSupabaseServer } from "@/lib/supabase/server";
import { successResponse, handleApiError, requireRoleInApi } from "@/lib/supabase/api-helpers";
import { NextRequest } from "next/server";

/**
 * GET /api/me/beauty-preferences
 * 
 * Get current user's beauty preferences
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['customer', 'provider_owner', 'provider_staff', 'superadmin'], request);
    const supabase = await getSupabaseServer();

    const { data: profileData, error } = await supabase
      .from("user_profiles")
      .select("beauty_preferences")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    const beautyPreferences = profileData?.beauty_preferences || {};

    return successResponse(beautyPreferences);
  } catch (error) {
    return handleApiError(error, "Failed to fetch beauty preferences");
  }
}

/**
 * PATCH /api/me/beauty-preferences
 * 
 * Update current user's beauty preferences
 */
export async function PATCH(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['customer', 'provider_owner', 'provider_staff', 'superadmin'], request);
    const supabase = await getSupabaseServer();
    const body = await request.json();

    const {
      hair_type,
      skin_type,
      allergies,
      things_to_avoid,
      appointment_style,
      preferred_times,
      preferred_days,
      product_preferences,
    } = body;

    // Get existing profile
    const { data: existingProfile } = await supabase
      .from("user_profiles")
      .select("beauty_preferences")
      .eq("user_id", user.id)
      .maybeSingle();

    const currentPreferences = existingProfile?.beauty_preferences || {};

    // Merge with new preferences (only update provided fields)
    const updatedPreferences: Record<string, unknown> = {
      ...currentPreferences,
    };

    if (hair_type !== undefined) updatedPreferences.hair_type = hair_type;
    if (skin_type !== undefined) updatedPreferences.skin_type = skin_type;
    if (allergies !== undefined) updatedPreferences.allergies = allergies || [];
    if (things_to_avoid !== undefined) updatedPreferences.things_to_avoid = things_to_avoid;
    if (appointment_style !== undefined) updatedPreferences.appointment_style = appointment_style;
    if (preferred_times !== undefined) updatedPreferences.preferred_times = preferred_times || [];
    if (preferred_days !== undefined) updatedPreferences.preferred_days = preferred_days || [];
    if (product_preferences !== undefined) updatedPreferences.product_preferences = product_preferences;

    // Update or insert profile
    const { data: profileData, error: checkError } = await supabase
      .from("user_profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (checkError && checkError.code !== 'PGRST116') {
      throw checkError;
    }

    let result;
    if (profileData) {
      // Update existing profile
      const { data, error } = await supabase
        .from("user_profiles")
        .update({ beauty_preferences: updatedPreferences })
        .eq("user_id", user.id)
        .select("beauty_preferences")
        .single();

      if (error) {
        throw error;
      }
      result = data?.beauty_preferences || {};
    } else {
      // Create new profile with beauty preferences
      const { data, error } = await supabase
        .from("user_profiles")
        .insert({
          user_id: user.id,
          beauty_preferences: updatedPreferences,
        })
        .select("beauty_preferences")
        .single();

      if (error) {
        throw error;
      }
      result = data?.beauty_preferences || {};
    }

    return successResponse(result);
  } catch (error) {
    return handleApiError(error, "Failed to update beauty preferences");
  }
}
