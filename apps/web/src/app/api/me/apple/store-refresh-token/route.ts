import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRoleInApi, successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { exchangeAppleAuthorizationCode } from "@/lib/auth/revoke-apple-sign-in";

/**
 * POST /api/me/apple/store-refresh-token
 *
 * Exchanges a native Sign in with Apple authorization code for a refresh token
 * and stores it on Auth app_metadata so account deletion can revoke SIWA (5.1.1(v)).
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["customer", "provider_owner", "provider_staff", "superadmin"],
      request,
    );

    const body = (await request.json().catch(() => ({}))) as { authorization_code?: string };
    const authorizationCode = body.authorization_code?.trim();
    if (!authorizationCode) {
      return errorResponse("authorization_code is required", "VALIDATION_ERROR", 400);
    }

    const refreshToken = await exchangeAppleAuthorizationCode(authorizationCode);
    if (!refreshToken) {
      return successResponse({ stored: false });
    }

    const admin = getSupabaseAdmin();
    const { data, error: getError } = await admin.auth.admin.getUserById(user.id);
    if (getError || !data?.user) {
      return errorResponse("Unable to load auth user", "AUTH_ERROR", 401);
    }

    const existingMeta = (data.user.app_metadata ?? {}) as Record<string, unknown>;
    const { error: updateError } = await admin.auth.admin.updateUserById(user.id, {
      app_metadata: {
        ...existingMeta,
        apple_refresh_token: refreshToken,
      },
    });
    if (updateError) throw updateError;

    return successResponse({ stored: true });
  } catch (error) {
    return handleApiError(error, "Failed to store Apple refresh token");
  }
}
