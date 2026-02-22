import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";

/**
 * GET /api/me/notification-preferences
 * 
 * Get current user's notification preferences
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['customer', 'provider_owner', 'provider_staff', 'superadmin'], request);
    const supabase = await getSupabaseServer();

    // Get notification preferences from user_profiles
    let profileData: any = null;
    let preferences: any = null;

    try {
      const { data, error } = await supabase
        .from("user_profiles")
        .select("notification_preferences")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        // If column doesn't exist, return default preferences instead of throwing
        if (error.code === '42703' || error.message?.includes('column') || error.message?.includes('does not exist')) {
          console.warn('Notification preferences column may not exist in user_profiles table:', error.message);
          profileData = null;
        } else {
          throw error;
        }
      } else {
        profileData = data;
      }
    } catch (err: any) {
      // Handle column not found errors gracefully
      if (err.code === '42703' || err.message?.includes('column') || err.message?.includes('does not exist')) {
        console.warn('Notification preferences column may not exist in user_profiles table:', err.message);
        profileData = null;
      } else {
        throw err;
      }
    }

    // Default notification preferences
    const defaultPreferences = {
      inspiration_and_offers: { email: true, sms: true, push: false },
      news_and_programs: { email: true, sms: true, push: false },
      feedback: { email: true, sms: false, push: false },
      travel_regulations: { email: true, sms: true, push: false },
      account_activity: { email: true, sms: true, push: false },
      client_policies: { email: true, sms: false, push: false },
      reminders: { email: true, sms: true, push: false },
      subscription_renewal: { email: true, sms: false, push: false },
      messages: { email: true, sms: true, push: true },
      unsubscribe_marketing: false,
    };

    preferences = profileData?.notification_preferences || defaultPreferences;

    return successResponse(preferences);
  } catch (error) {
    return handleApiError(error, "Failed to fetch notification preferences");
  }
}

/**
 * PATCH /api/me/notification-preferences
 * 
 * Update current user's notification preferences
 */
export async function PATCH(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['customer', 'provider_owner', 'provider_staff', 'superadmin'], request);
    const supabase = await getSupabaseServer();
    const body = await request.json();

    // Get existing preferences
    let existingProfile: any = null;
    try {
      const { data, error } = await supabase
        .from("user_profiles")
        .select("notification_preferences")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        // If column doesn't exist, use defaults
        if (error.code === '42703' || error.message?.includes('column') || error.message?.includes('does not exist')) {
          console.warn('Notification preferences column may not exist:', error.message);
          existingProfile = null;
        } else {
          throw error;
        }
      } else {
        existingProfile = data;
      }
    } catch (err: any) {
      // Handle column not found errors gracefully
      if (err.code === '42703' || err.message?.includes('column') || err.message?.includes('does not exist')) {
        console.warn('Notification preferences column may not exist:', err.message);
        existingProfile = null;
      } else {
        throw err;
      }
    }

    const defaultPreferences = {
      inspiration_and_offers: { email: true, sms: true, push: false },
      news_and_programs: { email: true, sms: true, push: false },
      feedback: { email: true, sms: false, push: false },
      travel_regulations: { email: true, sms: true, push: false },
      account_activity: { email: true, sms: true, push: false },
      client_policies: { email: true, sms: false, push: false },
      reminders: { email: true, sms: true, push: false },
      subscription_renewal: { email: true, sms: false, push: false },
      messages: { email: true, sms: true, push: true },
      unsubscribe_marketing: false,
    };

    const currentPreferences = existingProfile?.notification_preferences || defaultPreferences;
    
    // Merge with new preferences (deep merge for nested objects)
    const updatedPreferences: any = { ...currentPreferences };
    
    for (const [key, value] of Object.entries(body)) {
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        updatedPreferences[key] = { ...updatedPreferences[key], ...value };
      } else {
        updatedPreferences[key] = value;
      }
    }

    // Update or insert
    let profileData: any = null;
    try {
      const { data, error: checkError } = await supabase
        .from("user_profiles")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (checkError && checkError.code !== 'PGRST116') {
        // If table doesn't exist or other critical error, throw
        // But allow PGRST116 (no rows found) to continue
        throw checkError;
      }
      profileData = data;
    } catch (err: any) {
      // Only throw if it's not a "no rows found" error
      if (err.code !== 'PGRST116') {
        throw err;
      }
    }

    let result;
    try {
      if (profileData) {
        const { data, error } = await supabase
          .from("user_profiles")
          .update({ notification_preferences: updatedPreferences })
          .eq("user_id", user.id)
          .select("notification_preferences")
          .single();

        if (error) {
          // If column doesn't exist, provide helpful error
          if (error.code === '42703' || error.message?.includes('column') || error.message?.includes('does not exist')) {
            throw new Error('Notification preferences column not found. Please run database migration 105_add_tax_info_to_user_profiles.sql');
          }
          throw error;
        }
        result = data?.notification_preferences || {};
      } else {
        const { data, error } = await supabase
          .from("user_profiles")
          .insert({
            user_id: user.id,
            notification_preferences: updatedPreferences,
          })
          .select("notification_preferences")
          .single();

        if (error) {
          // If column doesn't exist, provide helpful error
          if (error.code === '42703' || error.message?.includes('column') || error.message?.includes('does not exist')) {
            throw new Error('Notification preferences column not found. Please run database migration 105_add_tax_info_to_user_profiles.sql');
          }
          throw error;
        }
        result = data?.notification_preferences || {};
      }
    } catch (err: any) {
      // Provide helpful error message for missing columns
      if (err.code === '42703' || err.message?.includes('column') || err.message?.includes('does not exist')) {
        throw new Error('Notification preferences column not found. Please run database migration 105_add_tax_info_to_user_profiles.sql');
      }
      throw err;
    }

    return successResponse(result);
  } catch (error) {
    return handleApiError(error, "Failed to update notification preferences");
  }
}
