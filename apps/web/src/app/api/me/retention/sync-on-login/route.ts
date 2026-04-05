import { NextRequest } from "next/server";
import { requireAuthInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { clearInactivityRetentionIfLoginAfterWarning } from "@/lib/retention/sync-on-login";

/**
 * POST /api/me/retention/sync-on-login
 * Clears inactivity countdown when auth.last_sign_in_at is after the warning (user returned without using the email link).
 *
 * Any authenticated user may call this (same as their own `users` row). Role-gating caused 403 for
 * admin/support roles and noisy console errors for guests — unauthenticated requests are a no-op.
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuthInApi(request);
    const result = await clearInactivityRetentionIfLoginAfterWarning(user.id);
    return successResponse(result);
  } catch (error) {
    if (error instanceof Error && error.message === "Authentication required") {
      return successResponse({ cleared: false });
    }
    return handleApiError(error, "Retention sync failed");
  }
}
