/**
 * Push the exact OS app-icon badge to a user's devices via OneSignal (SetTo).
 * Used after mark-all-read so killed/background apps clear stale badge counts.
 */
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getTotalUnreadBadgeCount } from "@/lib/notifications/total-unread-badge";
import { exactIosBadgeCount } from "@/lib/notifications/exact-ios-badge-count";
import { resolveTenantIdForPush } from "@/lib/notifications/resolve-tenant-for-push";
import { sendToUser } from "@/lib/notifications/onesignal";
import {
  getLastSyncedBadgeCount,
  recordSyncedBadgeCount,
} from "@/lib/notifications/badge-sync-state";
import { isAnyProviderPushSectionEnabled } from "@/lib/notifications/provider-notification-channels";
import type { OneSignalAppType } from "@/lib/platform/secrets";

type SyncPushBadgeOptions = {
  appType?: OneSignalAppType;
  tenantId?: string | null;
  /** When omitted, reads current unread count from the database. */
  unreadCount?: number;
};

/**
 * Whether silent badge_sync pushes are allowed for this user+app per their
 * notification preferences. Customer push opt-out is the maintained
 * `users.push_notifications_enabled` rollup; provider opt-out is derived from
 * `user_profiles.notification_preferences` (no master flag). Fails open so a
 * preference lookup error never blocks badge accuracy (best-effort anyway).
 */
async function isBadgePushEnabledForUser(
  userId: string,
  appType: OneSignalAppType,
): Promise<boolean> {
  try {
    const admin = getSupabaseAdmin();
    if (appType === "provider") {
      const { data } = await admin
        .from("user_profiles")
        .select("notification_preferences")
        .eq("user_id", userId)
        .maybeSingle();
      const prefs = (data?.notification_preferences as Record<string, unknown> | null) ?? null;
      return isAnyProviderPushSectionEnabled(prefs);
    }
    const { data } = await admin
      .from("users")
      .select("push_notifications_enabled")
      .eq("id", userId)
      .maybeSingle();
    return data?.push_notifications_enabled !== false;
  } catch (err) {
    console.warn("[syncPushBadgeCount] push-pref lookup failed:", err);
    return true;
  }
}

/** Distinct OneSignal apps this user has registered devices for. */
async function resolveRegisteredAppTypes(userId: string): Promise<OneSignalAppType[]> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("user_devices")
    .select("app_type")
    .eq("user_id", userId);
  if (error) {
    console.warn("[syncPushBadgeCountAllApps] device lookup failed:", error.message);
    return [];
  }
  const types = new Set<OneSignalAppType>();
  for (const row of data ?? []) {
    const raw = (row as { app_type?: string | null }).app_type;
    types.add(raw === "provider" ? "provider" : "customer");
  }
  return [...types];
}

/**
 * Best-effort badge sync — never throws (mark-all-read must not fail if OneSignal is down).
 */
export async function syncPushBadgeCount(
  userId: string,
  options?: SyncPushBadgeOptions,
): Promise<void> {
  if (!userId?.trim()) return;
  const appType = options?.appType ?? "customer";
  try {
    // Respect the user's push opt-out: a user who disabled push for this app
    // should not receive even silent OS-badge updates. The in-app foreground
    // sync still keeps the badge accurate while the app is open.
    if (!(await isBadgePushEnabledForUser(userId, appType))) return;

    const unread =
      typeof options?.unreadCount === "number"
        ? exactIosBadgeCount(options.unreadCount)
        : exactIosBadgeCount(await getTotalUnreadBadgeCount(userId, appType));

    const lastSynced = await getLastSyncedBadgeCount(userId, appType);
    if (lastSynced === unread) return;

    const result = await sendToUser(
      userId,
      {
        title: "\u200b",
        message: "\u200b",
        type: "badge_sync",
        data: { type: "badge_sync", silent: true, unread_count: unread },
        ios_badgeType: "SetTo",
        ios_badgeCount: unread,
        content_available: true,
        priority: 5,
        ios_interruption_level: "passive",
        name: `badge_sync_${unread}`,
      },
      ["push"],
      {
        appType,
        tenantId: options?.tenantId ?? undefined,
        skipMustDeliverRetryEnqueue: true,
      },
    );

    if (result.success) {
      await recordSyncedBadgeCount(userId, appType, unread);
    }
  } catch (err) {
    console.warn("[syncPushBadgeCount] failed:", err);
  }
}

/**
 * Sync exact unread count to customer + provider OneSignal apps (best-effort).
 * Omit `unreadCount` to read from the database after a read/mark-all mutation.
 * Only targets apps where the user has a registered device; skips unchanged counts.
 */
export async function syncPushBadgeCountAllApps(
  userId: string,
  unreadCount?: number,
  tenantId?: string | null,
): Promise<void> {
  const admin = getSupabaseAdmin();
  const resolvedTenantId =
    tenantId !== undefined ? tenantId : await resolveTenantIdForPush(admin, { userId });

  const registeredAppTypes = await resolveRegisteredAppTypes(userId);
  if (registeredAppTypes.length === 0) return;

  await Promise.all(
    registeredAppTypes.map(async (appType) => {
      const unread =
        typeof unreadCount === "number"
          ? exactIosBadgeCount(unreadCount)
          : exactIosBadgeCount(await getTotalUnreadBadgeCount(userId, appType));

      await syncPushBadgeCount(userId, {
        appType,
        unreadCount: unread,
        tenantId: resolvedTenantId,
      });
    }),
  );
}
