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
import {
  loadSelfServiceDeletionContext,
  notifyOpsSelfServiceAccountDeletion,
} from "@/lib/account/notify-ops-self-service-account-deletion";

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
      request,
    );
    const supabase = await getSupabaseServer(request);
    const body = await request.json();
    const { password, verificationNonce } = parseSensitiveActionCredentials(body);
    const reason = typeof body?.reason === "string" ? body.reason : null;

    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();

    if (!authUser) {
      return NextResponse.json({ error: "Not authenticated", code: "UNAUTHORIZED" }, { status: 401 });
    }

    if (authUser.id !== user.id) {
      console.warn("[delete-account] requireRole user id mismatch", {
        authUserId: authUser.id,
        roleUserId: user.id,
      });
    }

    const authSecurity = await resolveAuthSecurityForUser(supabase, authUser);
    const validation = validateSensitiveActionCredentials(
      authSecurity,
      { password, verificationNonce },
      "delete your account",
    );
    if (validation.ok === false) {
      return NextResponse.json(
        { error: validation.message, code: "VALIDATION_ERROR" },
        { status: validation.status },
      );
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
          code: "VERIFICATION_FAILED",
        },
        { status: 401 },
      );
    }

    const userId = authUser.id;
    const admin = getSupabaseAdmin();

    const deletionContext = await loadSelfServiceDeletionContext(admin, {
      userId,
      role: user.role,
      authEmail: authUser.email ?? user.email ?? null,
    });

    const { error: updateError } = await admin
      .from("users")
      .update({
        account_deletion_requested_at: new Date().toISOString(),
        is_active: false,
        deactivation_reason: reason || "Account deletion requested",
      })
      .eq("id", userId);

    if (updateError) {
      // Best-effort audit stamp — admin purge skips this entirely; do not block erasure.
      console.warn("Account deletion pre-update failed (continuing with purge):", {
        userId,
        code: updateError.code,
        message: updateError.message,
      });
    }

    const purgeResult = await purgePlatformUserAccountFully(admin, userId);
    if (purgeResult.ok === false) {
      console.error("Account deletion purge failed:", {
        userId,
        code: purgeResult.code,
        message: purgeResult.message,
      });
      void notifyOpsSelfServiceAccountDeletion(admin, {
        request,
        outcome: "failed",
        context: deletionContext,
        reason,
        failureCode: purgeResult.code ?? "DELETION_PURGE_FAILED",
        failureMessage: purgeResult.message,
        preUpdateFailed: Boolean(updateError),
      });
      return NextResponse.json(
        {
          error:
            purgeResult.code === "AUTH_DELETE_DATABASE_ERROR"
              ? "Could not complete account deletion because related records are still linked. Please contact support."
              : purgeResult.message ||
                "Could not complete account deletion. Please contact support.",
          code: purgeResult.code ?? "DELETION_PURGE_FAILED",
        },
        { status: 500 },
      );
    }

    try {
      await supabase.auth.signOut();
    } catch {
      /* session may already be invalid */
    }

    void notifyOpsSelfServiceAccountDeletion(admin, {
      request,
      outcome: "succeeded",
      context: deletionContext,
      reason,
      preUpdateFailed: Boolean(updateError),
      storageAttachmentsRemoved: purgeResult.storage_attachments_removed,
    });

    const isProviderOwner = user.role === "provider_owner";
    return successResponse({
      message:
        "Your account has been deleted and you have been signed out. Thank you for using Beautonomi.",
      ...(isProviderOwner
        ? {
            owner_notice:
              "Your provider profile, services, and linked business data were permanently removed.",
          }
        : {}),
    });
  } catch (error) {
    return handleApiError(error, "Failed to delete account");
  }
}
