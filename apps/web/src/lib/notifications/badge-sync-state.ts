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
