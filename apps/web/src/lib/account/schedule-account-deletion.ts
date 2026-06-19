import type { SupabaseClient } from "@supabase/supabase-js";
import {
  accountDeletionPurgeAfterDate,
  isAccountDeletionGraceEnabled,
  ACCOUNT_DELETION_GRACE_DAYS,
} from "@/lib/account/account-deletion-config";
import { buildAccountDeletionCancelUrl } from "@/lib/account/deletion-cancel-token";
import { sendResendEmail } from "@/lib/integrations/resend";

export type ScheduleDeletionResult =
  | {
      ok: true;
      purge_after_at: string;
      cancel_url: string;
    }
  | { ok: false; message: string; code?: string };

const ADMIN_BAN_DURATION = "876000h";

export async function banAuthUser(admin: SupabaseClient, userId: string): Promise<void> {
  const { error } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: ADMIN_BAN_DURATION,
  });
  if (error) {
    throw new Error(`Failed to ban auth user: ${error.message}`);
  }
}

export async function unbanAuthUser(admin: SupabaseClient, userId: string): Promise<void> {
  const { error } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: "0",
  });
  if (error) {
    throw new Error(`Failed to unban auth user: ${error.message}`);
  }
}

export async function scheduleAccountDeletion(
  admin: SupabaseClient,
  params: {
    userId: string;
    reason: string | null;
    email: string | null;
  },
): Promise<ScheduleDeletionResult> {
  if (!isAccountDeletionGraceEnabled()) {
    return { ok: false, message: "Grace period is not enabled", code: "GRACE_DISABLED" };
  }

  const now = new Date();
  const purgeAfter = accountDeletionPurgeAfterDate(now);
  const purgeAfterIso = purgeAfter.toISOString();

  const { error: updateError } = await admin
    .from("users")
    .update({
      is_active: false,
      deactivated_at: now.toISOString(),
      deactivated_by: "pending_deletion",
      deactivation_reason: params.reason || "Account deletion scheduled",
      account_deletion_requested_at: now.toISOString(),
      account_deletion_purge_after_at: purgeAfterIso,
    })
    .eq("id", params.userId);

  if (updateError) {
    return { ok: false, message: updateError.message, code: updateError.code };
  }

  try {
    await banAuthUser(admin, params.userId);
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Failed to lock account",
      code: "AUTH_BAN_FAILED",
    };
  }

  let cancelUrl: string;
  try {
    cancelUrl = buildAccountDeletionCancelUrl(params.userId, purgeAfterIso);
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Failed to build cancel link",
      code: "CANCEL_URL_FAILED",
    };
  }

  if (params.email) {
    void sendDeletionScheduledEmailBestEffort(admin, {
      to: params.email,
      cancelUrl,
      purgeAfterIso,
      graceDays: ACCOUNT_DELETION_GRACE_DAYS,
    });
  }

  return { ok: true, purge_after_at: purgeAfterIso, cancel_url: cancelUrl };
}

async function sendDeletionScheduledEmailBestEffort(
  admin: SupabaseClient,
  params: {
    to: string;
    cancelUrl: string;
    purgeAfterIso: string;
    graceDays: number;
  },
): Promise<void> {
  try {
    const purgeDate = new Date(params.purgeAfterIso).toLocaleDateString("en-ZA", {
      dateStyle: "long",
      timeZone: "Africa/Johannesburg",
    });
    await sendResendEmail({
      supabase: admin,
      to: params.to,
      subject: "Your Beautonomi account deletion is scheduled",
      html: `
        <p>We received your request to permanently delete your Beautonomi account.</p>
        <p>Your account is locked and scheduled for permanent deletion on <strong>${purgeDate}</strong> (${params.graceDays} days from now).</p>
        <p>If you did not request this, or you changed your mind, cancel the deletion using this link (valid until purge):</p>
        <p><a href="${params.cancelUrl}">Cancel account deletion</a></p>
        <p>After the scheduled date, your profile, messages, and related data will be permanently removed. Some anonymized financial records may be retained as required by law.</p>
        <p>If the link does not work, contact support with your account email.</p>
      `,
      text: `Your Beautonomi account is scheduled for permanent deletion on ${purgeDate}. Cancel: ${params.cancelUrl}`,
    });
  } catch (e) {
    console.warn("[schedule-account-deletion] cancel email failed:", e);
  }
}

export async function cancelScheduledAccountDeletion(
  admin: SupabaseClient,
  userId: string,
  expectedPurgeAfterAt?: string | null,
): Promise<{ ok: true } | { ok: false; message: string; code?: string }> {
  const { data: row, error: fetchError } = await admin
    .from("users")
    .select("id, deactivated_by, account_deletion_purge_after_at")
    .eq("id", userId)
    .maybeSingle();

  if (fetchError || !row) {
    return { ok: false, message: "User not found", code: "NOT_FOUND" };
  }

  if (row.deactivated_by !== "pending_deletion") {
    return { ok: false, message: "No pending deletion to cancel", code: "NOT_PENDING" };
  }

  if (expectedPurgeAfterAt) {
    const stored = row.account_deletion_purge_after_at as string | null;
    if (
      !stored ||
      Math.abs(new Date(stored).getTime() - new Date(expectedPurgeAfterAt).getTime()) >= 3000
    ) {
      return { ok: false, message: "Cancel link is no longer valid", code: "TOKEN_STALE" };
    }
  }

  const { error: updateError } = await admin
    .from("users")
    .update({
      is_active: true,
      deactivated_at: null,
      deactivated_by: null,
      deactivation_reason: null,
      account_deletion_requested_at: null,
      account_deletion_purge_after_at: null,
    })
    .eq("id", userId);

  if (updateError) {
    return { ok: false, message: updateError.message, code: updateError.code };
  }

  try {
    await unbanAuthUser(admin, userId);
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Failed to restore login",
      code: "AUTH_UNBAN_FAILED",
    };
  }

  return { ok: true };
}
