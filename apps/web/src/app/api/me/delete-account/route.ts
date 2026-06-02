import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRoleInApi, handleApiError, successResponse } from "@/lib/supabase/api-helpers";
import { purgePlatformUserAccountFully } from "@/lib/account/purge-platform-user";
import { verifySensitiveActionForUser } from "@/lib/auth/verify-sensitive-action";
import {
  parseSensitiveActionCredentials,
  resolveAuthSecurityForUser,
  validateSensitiveActionCredentials,
} from "@/lib/auth/validate-sensitive-action-input";

/**
 * POST /api/me/delete-account
 *
 * Permanently deletes the current user from Supabase Auth. `public.users` and most related rows
 * cascade from `auth.users`; chat files in Storage are removed explicitly so they are not left orphaned.
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["customer", "provider_owner", "provider_staff", "superadmin"],
      request
    );
    const supabase = await getSupabaseServer(request);
    const body = await request.json();
    const { password, verificationNonce } = parseSensitiveActionCredentials(body);
    const reason = typeof body?.reason === "string" ? body.reason : null;

    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();

    if (!authUser) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const authSecurity = await resolveAuthSecurityForUser(supabase, authUser);
    const validation = validateSensitiveActionCredentials(authSecurity, { password, verificationNonce }, "delete your account");
    if (validation.ok === false) {
      return NextResponse.json({ error: validation.message }, { status: validation.status });
    }

    const verified = await verifySensitiveActionForUser(supabase, authUser, {
      password: password || null,
      nonce: verificationNonce || null,
    });

    if (!verified) {
      return NextResponse.json(
        {
          error: password
            ? "Password is incorrect"
            : "Verification code is invalid or expired",
        },
        { status: 401 },
      );
    }

    const admin = getSupabaseAdmin();

    const { error: updateError } = await admin
      .from("users")
      .update({
        account_deletion_requested_at: new Date().toISOString(),
        is_active: false,
        deactivation_reason: reason || "Account deletion requested",
      })
      .eq("id", user.id);

    if (updateError) {
      // §provider-launch (2026-06): surface the real cause instead of falling
      // through to the generic handler so support can act on it.
      console.error("Account deletion pre-update failed:", {
        userId: user.id,
        code: updateError.code,
        message: updateError.message,
      });
      return NextResponse.json(
        {
          error:
            "Could not start account deletion. Please try again shortly or contact support if it persists.",
        },
        { status: 500 },
      );
    }

    const purgeResult = await purgePlatformUserAccountFully(admin, user.id);
    if (purgeResult.ok === false) {
      // Log the precise blocker (the RPC now RAISEs the exact table/constraint)
      // so we can fix any remaining RESTRICT chain quickly.
      console.error("Account deletion purge failed:", {
        userId: user.id,
        code: purgeResult.code,
        message: purgeResult.message,
      });
      return NextResponse.json(
        {
          error:
            purgeResult.code === "AUTH_DELETE_DATABASE_ERROR"
              ? "Could not complete account deletion because related records are still linked. Our team has been notified — please contact support."
              : purgeResult.message ||
                "Could not complete account deletion. Please contact support.",
        },
        { status: 500 },
      );
    }

    try {
      await supabase.auth.signOut();
    } catch {
      /* session may already be invalid */
    }

    return successResponse({
      message:
        "Your account has been deleted and you have been signed out. Thank you for using Beautonomi.",
    });
  } catch (error) {
    return handleApiError(error, "Failed to delete account");
  }
}
