import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAuthInApi,
  successResponse,
  handleApiError,
  errorResponse,
  isValidUUID,
  ACTIVE_PROVIDER_ID_COOKIE,
} from "@/lib/supabase/api-helpers";
import { syncPortalRoleAfterWorkplaceChange } from "@/lib/auth/effective-provider-role";

/**
 * POST /api/provider/memberships/leave
 * Staff leave a salon they do not own. Owners cannot leave their own business here.
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuthInApi(request);
    const body = await request.json().catch(() => ({}));
    const providerId =
      typeof body.provider_id === "string" && isValidUUID(body.provider_id.trim())
        ? body.provider_id.trim()
        : null;
    if (!providerId) {
      return errorResponse("provider_id is required", "VALIDATION_ERROR", 400);
    }

    const admin = getSupabaseAdmin();
    const { data: owned } = await admin
      .from("providers")
      .select("id")
      .eq("id", providerId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (owned) {
      return errorResponse(
        "You own this business. Transfer ownership before leaving.",
        "FORBIDDEN",
        403,
      );
    }

    const { data: staffRow } = await admin
      .from("provider_staff")
      .select("id")
      .eq("provider_id", providerId)
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();
    if (!staffRow) {
      return errorResponse("You are not an active member of this team", "NOT_FOUND", 404);
    }

    const { error } = await admin
      .from("provider_staff")
      .update({ is_active: false })
      .eq("id", staffRow.id);
    if (error) throw error;

    const role = await syncPortalRoleAfterWorkplaceChange(user.id);

    const { data: ownedNext } = await admin
      .from("providers")
      .select("id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();
    const { data: staffNext } = await admin
      .from("provider_staff")
      .select("provider_id")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(1);
    const nextProviderId = ownedNext?.id ?? staffNext?.[0]?.provider_id ?? null;

    const response = successResponse({
      left_provider_id: providerId,
      role,
      active_provider_id: nextProviderId,
    });
    if (nextProviderId && isValidUUID(nextProviderId)) {
      response.cookies.set(ACTIVE_PROVIDER_ID_COOKIE, nextProviderId, {
        path: "/",
        httpOnly: false,
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 365,
      });
    } else {
      response.cookies.set(ACTIVE_PROVIDER_ID_COOKIE, "", {
        path: "/",
        maxAge: 0,
      });
    }
    return response;
  } catch (error) {
    return handleApiError(error, "Failed to leave team");
  }
}
