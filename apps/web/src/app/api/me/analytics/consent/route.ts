/**
 * GET /api/me/analytics/consent
 *
 * Returns whether the user has consented to analytics/CDP (Amplitude).
 * Used by web and mobile to gate init and identify. Default true when not set.
 */

import { NextRequest } from "next/server";
import {
  successResponse,
  unauthorizedResponse,
  handleApiError,
  requireRoleInApi,
} from "@/lib/supabase/api-helpers";
import { getSupabaseServer } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["customer", "provider_owner", "provider_staff", "superadmin"],
      request
    );
    const supabase = await getSupabaseServer(request);

    const { data: profile } = await supabase
      .from("user_profiles")
      .select("privacy_settings")
      .eq("user_id", user.id)
      .maybeSingle();

    const privacySettings = (profile?.privacy_settings as { analytics_consent?: boolean } | null) ?? {};
    const analytics_consent = privacySettings.analytics_consent !== false;

    return successResponse({ analytics_consent });
  } catch (error) {
    if (error instanceof Error && error.message === "Authentication required") {
      return unauthorizedResponse();
    }
    return handleApiError(error, "Failed to get analytics consent");
  }
}
