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
import {
  ACCOUNT_DELETION_GRACE_DAYS,
  isAccountDeletionGraceEnabled,
} from "@/lib/account/account-deletion-config";
import { scheduleAccountDeletion } from "@/lib/account/schedule-account-deletion";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";

/**
 * POST /api/me/delete-account
 *
 * When grace period is enabled: schedules purge after 30 days (account locked, cancel via email).
 * Otherwise: immediate permanent erasure via purgePlatformUserAccountFully.
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
    const userEmail = authUser.email ?? user.email ?? null;

    if (isAccountDeletionGraceEnabled()) {
      const scheduleResult = await scheduleAccountDeletion(admin, {
        userId,
        reason,
        email: userEmail,
      });

      if (scheduleResult.ok === false) {
        return NextResponse.json(
          { error: scheduleResult.message, code: scheduleResult.code ?? "SCHEDULE_FAILED" },
          { status: 500 },
        );
      }

      try {
        await supabase.auth.signOut();
      } catch {
        /* session may already be invalid */
      }

      const reqMeta = extractRequestMeta(request);
      await writeAuditLog({
        actor_user_id: userId,
        actor_role: user.role,
        action: "user.account.deletion_scheduled",
        entity_type: "user",
        entity_id: userId,
        module: "users_trust",
        risk_level: user.role === "provider_owner" ? "critical" : "high",
        status: "succeeded",
        reason: reason ?? undefined,
        metadata: {
          purge_after_at: scheduleResult.purge_after_at,
          grace_days: ACCOUNT_DELETION_GRACE_DAYS,
        },
        ip_address: reqMeta.ip_address,
        user_agent: reqMeta.user_agent,
      });

      return successResponse({
        scheduled: true,
        purge_after_at: scheduleResult.purge_after_at,
        grace_days: ACCOUNT_DELETION_GRACE_DAYS,
        message: `Your account is scheduled for permanent deletion in ${ACCOUNT_DELETION_GRACE_DAYS} days. You have been signed out. Check your email for a link to cancel this request.`,
      });
    }

    const deletionContext = await loadSelfServiceDeletionContext(admin, {
      userId,
      role: user.role,
      authEmail: userEmail,
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
      scheduled: false,
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
