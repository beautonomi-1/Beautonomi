import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { persistMarketingConsent } from "@/lib/auth/persist-marketing-consent";

/**
 * POST /api/auth/consent
 * Persist marketing_consent on user_profiles.privacy_settings and feed notification prefs.
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["customer", "provider_owner", "provider_staff", "superadmin"],
      request,
    );
    const body = await request.json().catch(() => ({}));
    const marketingConsent = body?.marketing_consent === true;

    const supabase = await getSupabaseServer(request);
    const result = await persistMarketingConsent(supabase, user.id, marketingConsent);
    if (result.ok === false) {
      return errorResponse("Unable to save preferences.", "CONSENT_PERSIST_FAILED", 500);
    }

    return successResponse({ marketing_consent: marketingConsent });
  } catch (error) {
    return handleApiError(error, "Unable to save preferences.");
  }
}
