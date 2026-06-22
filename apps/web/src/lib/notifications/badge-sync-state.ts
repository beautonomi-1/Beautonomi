/**
 * Tracks the last OS app-icon badge value we successfully pushed to each
 * (user, app) so redundant silent `badge_sync` pushes can be skipped. This must
 * be updated by EVERY push that sets an absolute `SetTo` badge for a single
 * user (regular notifications included), otherwise the dedup guard can wrongly
 * skip a badge_sync after a normal push already moved the device badge.
 *
 * All helpers are best-effort and never throw — badge accuracy reconciles on
 * the next app foreground regardless.
 */
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { OneSignalAppType } from "@/lib/platform/secrets";

export async function getLastSyncedBadgeCount(
  userId: string,
  appType: OneSignalAppType,
): Promise<number | null> {
  try {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from("user_badge_sync_state")
      .select("last_count")
      .eq("user_id", userId)
      .eq("app_type", appType)
      .maybeSingle();
    if (error) {
      console.warn("[badge-sync-state] read failed:", error.message);
      return null;
    }
    return typeof data?.last_count === "number" ? data.last_count : null;
  } catch (err) {
    console.warn("[badge-sync-state] read threw:", err);
    return null;
  }
}

export async function recordSyncedBadgeCount(
  userId: string,
  appType: OneSignalAppType,
  count: number,
): Promise<void> {
  try {
    const admin = getSupabaseAdmin();
    const { error } = await admin.from("user_badge_sync_state").upsert(
      {
        user_id: userId,
        app_type: appType,
        last_count: count,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,app_type" },
    );
    if (error) {
      console.warn("[badge-sync-state] record failed:", error.message);
    }
  } catch (err) {
    console.warn("[badge-sync-state] record threw:", err);
  }
}

export type BadgeSyncClaimResult = {
  claimed: boolean;
  previousCount: number | null;
};

function parseClaimRpcResult(data: unknown): BadgeSyncClaimResult | null {
  if (!data || typeof data !== "object") return null;
  const o = data as { claimed?: unknown; previous_count?: unknown };
  if (typeof o.claimed !== "boolean") return null;
  const previousCount =
    typeof o.previous_count === "number"
      ? o.previous_count
      : o.previous_count === null
        ? null
        : null;
  return { claimed: o.claimed, previousCount };
}

/**
 * Atomically skip redundant badge_sync sends or claim the (user, app, count)
 * slot before calling OneSignal. Uses advisory-lock RPC when available; falls
 * back to read/compare/upsert (race-prone) if migration 710 is not applied yet.
 */
export async function tryClaimBadgeSyncSend(
  userId: string,
  appType: OneSignalAppType,
  count: number,
): Promise<BadgeSyncClaimResult> {
  try {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin.rpc("try_claim_badge_sync_send", {
      p_user_id: userId,
      p_app_type: appType,
      p_count: count,
    });
    const parsed = parseClaimRpcResult(data);
    if (!error && parsed) return parsed;
    if (error) {
      console.warn("[badge-sync-state] claim rpc failed:", error.message);
    }
  } catch (err) {
    console.warn("[badge-sync-state] claim rpc threw:", err);
  }

  const previousCount = await getLastSyncedBadgeCount(userId, appType);
  if (previousCount === count) {
    return { claimed: false, previousCount };
  }
  await recordSyncedBadgeCount(userId, appType, count);
  return { claimed: true, previousCount };
}

/** Undo a claim when OneSignal rejected the send (best-effort). */
export async function revertBadgeSyncClaim(
  userId: string,
  appType: OneSignalAppType,
  previousCount: number | null,
): Promise<void> {
  try {
    const admin = getSupabaseAdmin();
    if (previousCount === null) {
      const { error } = await admin
        .from("user_badge_sync_state")
        .delete()
        .eq("user_id", userId)
        .eq("app_type", appType);
      if (error) {
        console.warn("[badge-sync-state] revert delete failed:", error.message);
      }
      return;
    }
    await recordSyncedBadgeCount(userId, appType, previousCount);
  } catch (err) {
    console.warn("[badge-sync-state] revert threw:", err);
  }
}
