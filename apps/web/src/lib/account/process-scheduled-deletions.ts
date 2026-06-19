import type { SupabaseClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { purgePlatformUserAccountFully } from "@/lib/account/purge-platform-user";
import {
  loadSelfServiceDeletionContext,
  notifyOpsSelfServiceAccountDeletion,
} from "@/lib/account/notify-ops-self-service-account-deletion";
import { collectUserPurgeSnapshot } from "@/lib/account/compliance-purge-snapshot";
import { redactUserPurgeSnapshot } from "@/lib/account/compliance-snapshot-redaction";

export type ProcessScheduledDeletionsResult = {
  scanned: number;
  purged: number;
  failed: number;
  dry_run: boolean;
  errors: string[];
  would_purge_user_ids?: string[];
};

export async function processScheduledAccountDeletions(
  admin: SupabaseClient,
  opts: { dryRun?: boolean; batchLimit?: number; request?: NextRequest },
): Promise<ProcessScheduledDeletionsResult> {
  const dryRun = opts.dryRun === true;
  const limit = opts.batchLimit ?? 50;
  const now = new Date().toISOString();
  const errors: string[] = [];

  const { data: rows, error: selectErr } = await admin
    .from("users")
    .select("id, role, account_deletion_purge_after_at, deactivated_by")
    .eq("deactivated_by", "pending_deletion")
    .not("account_deletion_purge_after_at", "is", null)
    .lte("account_deletion_purge_after_at", now)
    .order("account_deletion_purge_after_at", { ascending: true })
    .limit(limit);

  if (selectErr) {
    errors.push(selectErr.message);
    return { scanned: 0, purged: 0, failed: 0, dry_run: dryRun, errors };
  }

  const candidates = rows ?? [];
  if (dryRun) {
    return {
      scanned: candidates.length,
      purged: 0,
      failed: 0,
      dry_run: true,
      errors,
      would_purge_user_ids: candidates.map((r: { id: string }) => r.id),
    };
  }

  let purged = 0;
  let failed = 0;

  for (const row of candidates as { id: string; role: string | null }[]) {
    const userId = row.id;
    const role = row.role ?? "customer";

    const { data: authRow } = await admin.auth.admin.getUserById(userId);
    const deletionContext = await loadSelfServiceDeletionContext(admin, {
      userId,
      role,
      authEmail: authRow?.user?.email ?? null,
    });

    const purgeResult = await purgePlatformUserAccountFully(admin, userId);
    if (purgeResult.ok === false) {
      failed += 1;
      errors.push(`${userId}: ${purgeResult.message}`);
      if (opts.request) {
        void notifyOpsSelfServiceAccountDeletion(admin, {
          request: opts.request,
          outcome: "failed",
          context: deletionContext,
          reason: "Scheduled deletion cron purge failed",
          failureCode: purgeResult.code ?? "DELETION_PURGE_FAILED",
          failureMessage: purgeResult.message,
        });
      }
      continue;
    }

    purged += 1;
    if (opts.request) {
      void notifyOpsSelfServiceAccountDeletion(admin, {
        request: opts.request,
        outcome: "succeeded",
        context: deletionContext,
        reason: "Scheduled self-service account deletion (grace period elapsed)",
        storageAttachmentsRemoved: purgeResult.storage_attachments_removed,
      });
    }
  }

  return {
    scanned: candidates.length,
    purged,
    failed,
    dry_run: false,
    errors,
  };
}

/** Redacted snapshot helper for admin purge reports (schema v3). */
export async function loadRedactedUserPurgeSnapshot(admin: SupabaseClient, userId: string) {
  const snapshot = await collectUserPurgeSnapshot(admin, userId);
  if (!snapshot) return null;
  return redactUserPurgeSnapshot(snapshot);
}
