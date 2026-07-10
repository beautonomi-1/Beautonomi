/**
 * Clears identity verification state so a user/provider can re-verify via Didit
 * or manual upload after an admin reset or unverify.
 *
 * Caller MUST pass an admin-scoped Supabase client (service_role).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  syncProviderVerificationState,
  type SyncProviderVerificationStateResult,
} from "./sync-provider-verification";

/** Session statuses that no longer block a new verification attempt. */
const SESSION_TERMINAL_FOR_REVERIFY = '("rejected","expired","abandoned","errored")';

export interface ClearIdentityVerificationForReverifyInput {
  userId: string;
  providerId?: string | null;
  adminUserId: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface ClearIdentityVerificationForReverifyResult
  extends SyncProviderVerificationStateResult {
  sessionsAbandoned: number;
}

const DEFAULT_REASON =
  "Verification reset by admin — submit new documents if you are asked to re-verify.";

export async function clearIdentityVerificationForReverify(
  admin: SupabaseClient,
  input: ClearIdentityVerificationForReverifyInput,
): Promise<ClearIdentityVerificationForReverifyResult> {
  const now = new Date().toISOString();
  const reason = input.reason ?? DEFAULT_REASON;
  const errors: string[] = [];
  let sessionsAbandoned = 0;

  let userId = input.userId;
  if (!userId && input.providerId) {
    const { data: providerRow } = await admin
      .from("providers")
      .select("user_id")
      .eq("id", input.providerId)
      .maybeSingle();
    userId = (providerRow as { user_id?: string | null } | null)?.user_id ?? "";
  }

  if (userId) {
    try {
      const { error } = await admin
        .from("user_verifications")
        .update({
          status: "rejected",
          rejection_reason: reason,
          reviewed_at: now,
          reviewed_by: input.adminUserId,
        })
        .eq("user_id", userId)
        .in("status", ["pending", "in_progress", "submitted", "under_review"]);
      if (error) {
        errors.push(`user_verifications: ${error.message}`);
      }
    } catch (err) {
      errors.push(
        `user_verifications: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  try {
    let sessionQuery = admin
      .from("identity_verification_sessions")
      .update({
        status: "abandoned",
        rejection_reason: reason,
        updated_at: now,
      })
      .not("status", "in", SESSION_TERMINAL_FOR_REVERIFY);

    if (input.providerId) {
      sessionQuery = sessionQuery
        .eq("provider_id", input.providerId)
        .eq("persona_type", "provider");
    } else {
      sessionQuery = sessionQuery
        .eq("user_id", input.userId)
        .eq("persona_type", "customer");
    }

    const { data: abandonedRows, error } = await sessionQuery.select("id");
    if (error) {
      errors.push(`identity_verification_sessions: ${error.message}`);
    } else {
      sessionsAbandoned = abandonedRows?.length ?? 0;
    }
  } catch (err) {
    errors.push(
      `identity_verification_sessions: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const syncResult: ClearIdentityVerificationForReverifyResult = {
    ok: true,
    providerId: input.providerId ?? "",
    badgeChanged: false,
    identityFlagChanged: false,
    errors: [...errors],
    sessionsAbandoned,
  };

  if (input.providerId) {
    const providerSync = await syncProviderVerificationState(admin, {
      providerId: input.providerId,
      userId: userId || null,
      status: "reset",
      source: "admin_reset",
      metadata: {
        reset_by_user_id: input.adminUserId,
        reset_reason: reason,
        sessions_abandoned: sessionsAbandoned,
        ...(input.metadata ?? {}),
      },
    });
    syncResult.providerId = providerSync.providerId;
    syncResult.badgeChanged = providerSync.badgeChanged;
    syncResult.identityFlagChanged = providerSync.identityFlagChanged;
    syncResult.errors.push(...providerSync.errors);
  } else if (userId) {
    try {
      const { error } = await admin
        .from("users")
        .update({
          identity_verified: false,
          identity_verification_status: "none",
          identity_verification_submitted_at: null,
          identity_verification_reviewed_at: null,
          identity_verification_reviewed_by: null,
          updated_at: now,
        })
        .eq("id", userId);
      if (error) {
        syncResult.errors.push(`users: ${error.message}`);
      } else {
        syncResult.identityFlagChanged = true;
      }
    } catch (err) {
      syncResult.errors.push(
        `users: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  syncResult.ok = syncResult.errors.length === 0;

  return syncResult;
}
