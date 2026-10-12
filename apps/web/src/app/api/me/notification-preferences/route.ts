import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { computeUserNotificationRollup } from "@/lib/notifications/customer-notification-channels";
import {
  getCustomerNotificationDefaults,
  withCustomerFlatKeys,
} from "@/lib/notifications/notification-preferences-defaults";
import { materializeCustomerNotificationPreferences } from "@/lib/notifications/materialize-notification-preferences";

/**
 * GET /api/me/notification-preferences
 *
 * Get current user's notification preferences
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['customer', 'provider_owner', 'provider_staff', 'superadmin'], request);
    const supabase = await getSupabaseServer(request);

    let profileData: { notification_preferences?: unknown } | null = null;

    try {
      const { data, error } = await supabase
        .from("user_profiles")
        .select("notification_preferences, privacy_settings")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        if (error.code === '42703' || error.message?.includes('column') || error.message?.includes('does not exist')) {
          console.warn('Notification preferences column may not exist in user_profiles table:', error.message);
          profileData = null;
        } else {
          throw error;
        }
      } else {
        profileData = data;
      }
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string };
      if (e.code === '42703' || e.message?.includes('column') || e.message?.includes('does not exist')) {
        console.warn('Notification preferences column may not exist in user_profiles table:', e.message);
        profileData = null;
      } else {
        throw err;
      }
    }

    const privacy = profileData?.privacy_settings as Record<string, unknown> | undefined;
    const marketingConsented =
      privacy?.receive_marketing === true || privacy?.marketing_consent === true;

    const rawExisting = profileData?.notification_preferences as Record<string, unknown> | null | undefined;
    const preferences = await materializeCustomerNotificationPreferences(
      supabase,
      user.id,
      rawExisting,
      { marketingConsented: marketingConsented || undefined },
    );

    return successResponse(withCustomerFlatKeys(preferences));
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
    const supabase = await getSupabaseServer(request);
    const body = await request.json();

    let existingProfile: { notification_preferences?: unknown } | null = null;
    try {
      const { data, error } = await supabase
        .from("user_profiles")
        .select("notification_preferences")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        if (error.code === '42703' || error.message?.includes('column') || error.message?.includes('does not exist')) {
          console.warn('Notification preferences column may not exist:', error.message);
          existingProfile = null;
        } else {
          throw error;
        }
      } else {
        existingProfile = data;
      }
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string };
      if (e.code === '42703' || e.message?.includes('column') || e.message?.includes('does not exist')) {
        console.warn('Notification preferences column may not exist:', e.message);
        existingProfile = null;
      } else {
        throw err;
      }
    }

    const defaultPreferences = getCustomerNotificationDefaults({ marketingConsented: false });
    const currentPreferences =
      (existingProfile?.notification_preferences as Record<string, unknown>) || defaultPreferences;

    const updatedPreferences: Record<string, unknown> = { ...currentPreferences };

    for (const [key, value] of Object.entries(body)) {
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        updatedPreferences[key] = { ...(updatedPreferences[key] as object), ...value };
      } else {
        updatedPreferences[key] = value;
      }
    }

    let profileData: { id?: string } | null = null;
    try {
      const { data, error: checkError } = await supabase
        .from("user_profiles")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (checkError && checkError.code !== 'PGRST116') {
        throw checkError;
      }
      profileData = data;
    } catch (err: unknown) {
      const e = err as { code?: string };
      if (e.code !== 'PGRST116') {
        throw err;
      }
    }

    let result: Record<string, unknown>;
    try {
      if (profileData) {
        const { data, error } = await supabase
          .from("user_profiles")
          .update({ notification_preferences: updatedPreferences })
          .eq("user_id", user.id)
          .select("notification_preferences")
          .single();

        if (error) {
          if (error.code === '42703' || error.message?.includes('column') || error.message?.includes('does not exist')) {
            throw new Error('Notification preferences column not found. Please run database migration 105_add_tax_info_to_user_profiles.sql');
          }
          throw error;
        }
        result = (data?.notification_preferences as Record<string, unknown>) || {};
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
          if (error.code === '42703' || error.message?.includes('column') || error.message?.includes('does not exist')) {
            throw new Error('Notification preferences column not found. Please run database migration 105_add_tax_info_to_user_profiles.sql');
          }
          throw error;
        }
        result = (data?.notification_preferences as Record<string, unknown>) || {};
      }
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string };
      if (e.code === '42703' || e.message?.includes('column') || e.message?.includes('does not exist')) {
        throw new Error('Notification preferences column not found. Please run database migration 105_add_tax_info_to_user_profiles.sql');
      }
      throw err;
    }

    try {
      const rollup = computeUserNotificationRollup(updatedPreferences);
      const patch: Record<string, unknown> = { ...rollup };
      const anyWhatsappOn = rollup.whatsapp_notifications_enabled;
      if (anyWhatsappOn) {
        patch.whatsapp_opt_in_at = new Date().toISOString();
        patch.whatsapp_opt_in_source = "notification_preferences";
      }
      await supabase.from("users").update(patch).eq("id", user.id);
    } catch (syncErr) {
      console.warn("notification-preferences: could not sync users notification flags", syncErr);
    }

    return successResponse(result);
  } catch (error) {
    return handleApiError(error, "Failed to update notification preferences");
  }
}
