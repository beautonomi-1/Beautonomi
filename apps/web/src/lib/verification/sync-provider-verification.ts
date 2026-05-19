/**
 * §provider-verification-sync 2026-05
 *
 * Provider verification touches three tables that historically drifted apart:
 *
 *   1. `provider_verification_status` — Sumsub/KYC source of truth
 *   2. `users.identity_verified`       — drives setup checklist + identity badges
 *   3. `providers.is_verified`         — public marketplace "Verified" badge
 *
 * Whenever a provider passes Sumsub OR an admin approves a manual document,
 * we want all three to agree. Conversely, rejection/reset should clear the
 * public badge so an outdated approval can't survive a later rejection.
 *
 * This helper is the single place that fans the outcome out so the webhook,
 * the manual admin route, and any future surface (e.g. reset endpoint) stay
 * in lockstep without duplicating SQL update logic.
 *
 * Caller MUST pass an admin-scoped Supabase client (service_role).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Internal status vocabulary used across the codebase:
 *   - `approved`    Identity confirmed (Sumsub GREEN or admin approve)
 *   - `rejected`    Identity rejected (Sumsub RED or admin reject)
 *   - `in_progress` Awaiting Sumsub/manual review (no badge change yet)
 *   - `reset`       Admin reset — clears identity state without rejecting
 */
export type ProviderVerificationOutcome = "approved" | "rejected" | "in_progress" | "reset";

export interface SyncProviderVerificationStateInput {
  /** Provider row to update. */
  providerId: string;
  /** Owner / staff user id that submitted the verification (manual or Sumsub). */
  userId?: string | null;
  /** Internal outcome (see `ProviderVerificationOutcome`). */
  status: ProviderVerificationOutcome;
  /**
   * Source identifier so audit/metadata rows are useful when reading the
   * `provider_verification_status.metadata` blob later.
   */
  source: "sumsub" | "manual_admin" | "admin_reset" | "manual_upload";
  /** Sumsub applicant id when known (for Sumsub-sourced calls). */
  sumsubApplicantId?: string | null;
  /** Free-form metadata stored alongside the row. */
  metadata?: Record<string, unknown>;
}

export interface SyncProviderVerificationStateResult {
  ok: boolean;
  providerId: string;
  badgeChanged: boolean;
  identityFlagChanged: boolean;
  errors: string[];
}

/**
 * Resolve provider id from a user id (owner first, then active staff). Pure
 * helper exposed for tests + admin tooling.
 */
export async function resolveProviderIdForUser(
  admin: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data: ownerProvider } = await admin
    .from("providers")
    .select("id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if ((ownerProvider as { id?: string } | null)?.id) {
    return (ownerProvider as { id: string }).id;
  }
  const { data: staffProvider } = await admin
    .from("provider_staff")
    .select("provider_id")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (staffProvider as { provider_id?: string } | null)?.provider_id ?? null;
}

/**
 * Apply a provider verification outcome to all three downstream tables.
 *
 * - `approved`     → identity_verified=true,  is_verified=true,  KYC=approved
 * - `rejected`     → identity_verified=false, is_verified=false, KYC=rejected
 * - `reset`        → identity_verified=false, is_verified=false, KYC=reset
 * - `in_progress`  → identity_verified unchanged, is_verified unchanged,
 *                    KYC=in_progress (so the provider screen can show
 *                    "Under review" without revoking an existing badge)
 *
 * Errors on any single table are collected so the caller can decide whether
 * a partial write is acceptable. The function is intentionally idempotent —
 * re-running it for the same outcome must be a no-op.
 */
export async function syncProviderVerificationState(
  admin: SupabaseClient,
  input: SyncProviderVerificationStateInput,
): Promise<SyncProviderVerificationStateResult> {
  const result: SyncProviderVerificationStateResult = {
    ok: true,
    providerId: input.providerId,
    badgeChanged: false,
    identityFlagChanged: false,
    errors: [],
  };
  const now = new Date().toISOString();
  const isApproved = input.status === "approved";
  const isRejected = input.status === "rejected";
  const isReset = input.status === "reset";

  try {
    const upsert: Record<string, unknown> = {
      provider_id: input.providerId,
      status: input.status,
      last_reviewed_at: isApproved || isRejected ? now : null,
      updated_at: now,
      metadata: {
        source: input.source,
        ...(input.metadata ?? {}),
      },
    };
    if (input.sumsubApplicantId) {
      upsert.sumsub_applicant_id = input.sumsubApplicantId;
    }
    const { error } = await admin
      .from("provider_verification_status")
      .upsert(upsert, { onConflict: "provider_id" });
    if (error) {
      result.ok = false;
      result.errors.push(`provider_verification_status: ${error.message}`);
    }
  } catch (err) {
    result.ok = false;
    result.errors.push(
      `provider_verification_status: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // `users.identity_verified` is only mutated when we have a definitive
  // approve/reject/reset signal — `in_progress` keeps the previous flag so
  // a re-submission cannot accidentally revoke a still-valid badge.
  if (input.userId && (isApproved || isRejected || isReset)) {
    try {
      const { error } = await admin
        .from("users")
        .update({
          identity_verified: isApproved,
          identity_verification_status: input.status,
          identity_verification_reviewed_at: now,
        })
        .eq("id", input.userId);
      if (error) {
        result.ok = false;
        result.errors.push(`users.identity_verified: ${error.message}`);
      } else {
        result.identityFlagChanged = true;
      }
    } catch (err) {
      result.ok = false;
      result.errors.push(
        `users.identity_verified: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // Public marketplace badge — flip ON for approved, OFF for rejected/reset.
  // We deliberately do NOT down-grade `is_verified` on `in_progress` so a
  // provider whose badge was previously approved keeps it visible while they
  // re-submit a document.
  if (isApproved || isRejected || isReset) {
    try {
      const { data: before } = await admin
        .from("providers")
        .select("is_verified")
        .eq("id", input.providerId)
        .maybeSingle();
      const previous = (before as { is_verified?: boolean | null } | null)?.is_verified === true;
      const next = isApproved;
      const { error } = await admin
        .from("providers")
        .update({ is_verified: next, updated_at: now })
        .eq("id", input.providerId);
      if (error) {
        result.ok = false;
        result.errors.push(`providers.is_verified: ${error.message}`);
      } else if (previous !== next) {
        result.badgeChanged = true;
      }
    } catch (err) {
      result.ok = false;
      result.errors.push(
        `providers.is_verified: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return result;
}
