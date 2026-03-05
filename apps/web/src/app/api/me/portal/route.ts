import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getUserRoleServer, getPortalForUser } from "@/lib/auth/role";
import {
  successResponse,
  handleApiError,
  requireAuthInApi,
  unauthorizedResponse,
} from "@/lib/supabase/api-helpers";

/**
 * GET /api/me/portal
 * Returns role, portal, provider_id, provider_status for the authenticated user.
 * Used by web /portal page and mobile apps to route users and detect wrong-app login.
 * Requires auth; reads from public.users.role and providers; never returns secrets.
 */
export async function GET(request: NextRequest) {
  try {
    await requireAuthInApi(request);
    const supabase = await getSupabaseServer(request);
    const result = await getUserRoleServer(supabase);

    if (!result) {
      return unauthorizedResponse("User profile not found");
    }

    const portal = getPortalForUser({
      role: result.role,
      provider_status: result.provider_status,
    });

    return successResponse({
      role: result.role,
      portal,
      provider_id: result.provider_id,
      provider_status: result.provider_status,
    });
  } catch (error) {
    return handleApiError(error, "Failed to get portal");
  }
}
