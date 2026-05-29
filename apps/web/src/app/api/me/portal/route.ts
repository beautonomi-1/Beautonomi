import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getPortalForUser } from "@/lib/auth/role";
import { getUserRoleServer, ensurePublicUserRowExists } from "@/lib/auth/role-server";
import { bootstrapPreferredHomeTenantForAuthedUser } from "@/lib/tenant/assign-preferred-home-tenant-from-host";
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
 *
 * §Release-audit 2026-04: converged with `requireRoleInApi`'s self-heal semantics.
 * If `public.users` has no row yet for the authenticated Supabase user (e.g. phone-only
 * signups or users created before the `on_auth_user_created` trigger shipped), we
 * upsert a default "customer" row via admin privileges and retry. This removed the
 * mobile-only "Couldn't verify your account" / infinite-loading failure mode where
 * web cookie sessions succeeded (they already had a row) but Bearer sessions failed.
 */
export async function GET(request: NextRequest) {
  try {
    const { user: authUser } = await requireAuthInApi(request);
    const supabase = await getSupabaseServer(request);
    let result = await getUserRoleServer(supabase);

    if (!result) {
      const healed = await ensurePublicUserRowExists(authUser);
      if (healed) {
        result = await getUserRoleServer(supabase);
      }
    }

    if (!result) {
      return unauthorizedResponse("User profile not found");
    }

    await bootstrapPreferredHomeTenantForAuthedUser(authUser.id, request);

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
