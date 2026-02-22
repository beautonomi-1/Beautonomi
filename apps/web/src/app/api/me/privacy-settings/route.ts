import { getSupabaseServer } from "@/lib/supabase/server";
import { successResponse, handleApiError, requireRoleInApi } from "@/lib/supabase/api-helpers";
import { NextRequest } from "next/server";

/**
 * GET /api/me/privacy-settings
 * 
 * Get current user's privacy settings
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['customer', 'provider_owner', 'provider_staff', 'superadmin'], request);
    const supabase = await getSupabaseServer();

    // Get settings from both users table (columns) and user_profiles (JSONB)
    const [userDataResult, profileDataResult] = await Promise.all([
      supabase
        .from("users")
        .select("account_visibility, profile_information_visible, read_receipts_enabled, include_in_search_engines, show_home_city_in_reviews, show_trip_type_in_reviews, show_length_of_stay_in_reviews")
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("user_profiles")
        .select("privacy_settings")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);

    const userData = userDataResult.data;
    const profileData = profileDataResult.data;
    const profileError = profileDataResult.error;

    // Only throw if it's not a "not found" error for profile
    if (profileError && profileError.code !== 'PGRST116') {
      throw profileError;
    }

    // Default privacy settings
    const defaultSettings = {
      accountVisibility: false,
      profileInformation: false,
      readReceipts: false,
      includeInSearchEngines: false,
      showHomeCity: false,
      showTripType: false,
      showLengthOfStay: false,
      services_booked_visible: false,
      interests_visible: false,
      questions_visible: false,
    };

    // Merge settings from users table (columns) with user_profiles (JSONB)
    const mergedSettings = {
      ...defaultSettings,
      // Map from users table columns
      accountVisibility: userData?.account_visibility ?? defaultSettings.accountVisibility,
      profileInformation: userData?.profile_information_visible ?? defaultSettings.profileInformation,
      readReceipts: userData?.read_receipts_enabled ?? defaultSettings.readReceipts,
      includeInSearchEngines: userData?.include_in_search_engines ?? defaultSettings.includeInSearchEngines,
      showHomeCity: userData?.show_home_city_in_reviews ?? defaultSettings.showHomeCity,
      showTripType: userData?.show_trip_type_in_reviews ?? defaultSettings.showTripType,
      showLengthOfStay: userData?.show_length_of_stay_in_reviews ?? defaultSettings.showLengthOfStay,
      // Merge with JSONB settings (these take precedence if present)
      ...(profileData?.privacy_settings || {}),
    };

    return successResponse(mergedSettings);
  } catch (error) {
    return handleApiError(error, "Failed to fetch privacy settings");
  }
}

/**
 * PATCH /api/me/privacy-settings
 * 
 * Update current user's privacy settings
 */
export async function PATCH(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['customer', 'provider_owner', 'provider_staff', 'superadmin'], request);
    const supabase = await getSupabaseServer();
    const body = await request.json();

    // Get existing profile
    const { data: existingProfile } = await supabase
      .from("user_profiles")
      .select("privacy_settings")
      .eq("user_id", user.id)
      .maybeSingle();

    const defaultSettings = {
      accountVisibility: false,
      profileInformation: false,
      readReceipts: false,
      includeInSearchEngines: false,
      showHomeCity: false,
      showTripType: false,
      showLengthOfStay: false,
      services_booked_visible: false,
      interests_visible: false,
      questions_visible: false,
    };

    const currentSettings = existingProfile?.privacy_settings || defaultSettings;

    // Merge with new settings (only update provided fields)
    const updatedSettings: Record<string, unknown> = {
      ...defaultSettings,
      ...currentSettings,
      ...body, // Override with any provided fields
    };

    // Map frontend field names to database column names
    const usersTableUpdates: Record<string, boolean> = {};
    const privacySettingsJsonb: Record<string, unknown> = {};

    // Fields that go to users table columns
    if (body.accountVisibility !== undefined) {
      usersTableUpdates.account_visibility = body.accountVisibility;
    }
    if (body.profileInformation !== undefined) {
      usersTableUpdates.profile_information_visible = body.profileInformation;
    }
    if (body.readReceipts !== undefined) {
      usersTableUpdates.read_receipts_enabled = body.readReceipts;
    }
    if (body.includeInSearchEngines !== undefined) {
      usersTableUpdates.include_in_search_engines = body.includeInSearchEngines;
    }
    if (body.showHomeCity !== undefined) {
      usersTableUpdates.show_home_city_in_reviews = body.showHomeCity;
    }
    if (body.showTripType !== undefined) {
      usersTableUpdates.show_trip_type_in_reviews = body.showTripType;
    }
    if (body.showLengthOfStay !== undefined) {
      usersTableUpdates.show_length_of_stay_in_reviews = body.showLengthOfStay;
    }

    // Fields that go to user_profiles.privacy_settings JSONB
    if (body.services_booked_visible !== undefined) {
      privacySettingsJsonb.services_booked_visible = body.services_booked_visible;
    }
    if (body.interests_visible !== undefined) {
      privacySettingsJsonb.interests_visible = body.interests_visible;
    }
    if (body.questions_visible !== undefined) {
      privacySettingsJsonb.questions_visible = body.questions_visible;
    }

    // Update users table if there are column updates
    if (Object.keys(usersTableUpdates).length > 0) {
      const { error: usersError } = await supabase
        .from("users")
        .update(usersTableUpdates)
        .eq("id", user.id);

      if (usersError) {
        throw usersError;
      }
    }

    // Update or insert user_profiles with JSONB settings
    if (Object.keys(privacySettingsJsonb).length > 0) {
      const { data: profileData, error: checkError } = await supabase
        .from("user_profiles")
        .select("privacy_settings")
        .eq("user_id", user.id)
        .maybeSingle();

      if (checkError && checkError.code !== 'PGRST116') {
        throw checkError;
      }

      const currentJsonbSettings = profileData?.privacy_settings || {};
      const updatedJsonbSettings = {
        ...currentJsonbSettings,
        ...privacySettingsJsonb,
      };

      if (profileData) {
        const { error: profileError } = await supabase
          .from("user_profiles")
          .update({ privacy_settings: updatedJsonbSettings })
          .eq("user_id", user.id);

        if (profileError) {
          throw profileError;
        }
      } else {
        const { error: profileError } = await supabase
          .from("user_profiles")
          .insert({
            user_id: user.id,
            privacy_settings: updatedJsonbSettings,
          });

        if (profileError) {
          throw profileError;
        }
      }
    }

    // Return the merged updated settings
    return successResponse(updatedSettings);
  } catch (error) {
    return handleApiError(error, "Failed to update privacy settings");
  }
}
