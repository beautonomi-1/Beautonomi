import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";

/**
 * GET /api/me/business-settings
 *
 * Returns the current user's business account settings (Beautonomi for Business).
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["customer", "provider_owner", "provider_staff", "superadmin"],
      request
    );
    const supabase = await getSupabaseServer();

    const { data: profile, error } = await supabase
      .from("user_profiles")
      .select("business_preferences")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) throw error;

    const prefs = (profile as any)?.business_preferences || { email: null, enabled: false };

    return successResponse({
      settings: {
        business_email: prefs.email ?? null,
        is_enabled: prefs.enabled === true,
      },
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch business settings");
  }
}

/**
 * PATCH /api/me/business-settings
 *
 * Update the current user's business account settings.
 * Body: { business_email?: string | null, is_enabled?: boolean }
 */
export async function PATCH(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["customer", "provider_owner", "provider_staff", "superadmin"],
      request
    );
    const supabase = await getSupabaseServer();
    const body = await request.json();

    const business_email = body.business_email !== undefined ? (body.business_email || null) : undefined;
    const is_enabled = body.is_enabled !== undefined ? Boolean(body.is_enabled) : undefined;

    if (business_email === undefined && is_enabled === undefined) {
      return successResponse({ settings: { business_email: null, is_enabled: false } });
    }

    const { data: existing } = await supabase
      .from("user_profiles")
      .select("id, business_preferences")
      .eq("user_id", user.id)
      .maybeSingle();

    const current = (existing as any)?.business_preferences || { email: null, enabled: false };
    const businessPreferences = {
      email: business_email !== undefined ? business_email : current.email,
      enabled: is_enabled !== undefined ? is_enabled : current.enabled,
    };

    if (existing) {
      const { error: updateError } = await supabase
        .from("user_profiles")
        .update({ business_preferences: businessPreferences })
        .eq("user_id", user.id);
      if (updateError) throw updateError;
    } else {
      const { error: insertError } = await supabase
        .from("user_profiles")
        .insert({ user_id: user.id, business_preferences: businessPreferences });
      if (insertError) throw insertError;
    }

    return successResponse({
      settings: {
        business_email: businessPreferences.email,
        is_enabled: businessPreferences.enabled,
      },
    });
  } catch (error) {
    return handleApiError(error, "Failed to update business settings");
  }
}
