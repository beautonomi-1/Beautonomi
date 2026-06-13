/**
 * Push the exact OS app-icon badge to a user's devices via OneSignal (SetTo).
 * Used after mark-all-read so killed/background apps clear stale badge counts.
 */
import { getTotalUnreadBadgeCount } from "@/lib/notifications/total-unread-badge";
import { exactIosBadgeCount } from "@/lib/notifications/exact-ios-badge-count";
import { sendToUser } from "@/lib/notifications/onesignal";
import type { OneSignalAppType } from "@/lib/platform/secrets";

type SyncPushBadgeOptions = {
  appType?: OneSignalAppType;
  tenantId?: string | null;
  /** When omitted, reads current unread count from the database. */
  unreadCount?: number;
};

/**
 * Best-effort badge sync — never throws (mark-all-read must not fail if OneSignal is down).
 */
export async function syncPushBadgeCount(
  userId: string,
  options?: SyncPushBadgeOptions,
): Promise<void> {
  if (!userId?.trim()) return;
  try {
    const unread =
      typeof options?.unreadCount === "number"
        ? exactIosBadgeCount(options.unreadCount)
        : exactIosBadgeCount(
            await getTotalUnreadBadgeCount(userId, options?.appType ?? "customer"),
          );

    await sendToUser(
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
        appType: options?.appType,
        tenantId: options?.tenantId ?? undefined,
        skipMustDeliverRetryEnqueue: true,
      },
    );
  } catch (err) {
    console.warn("[syncPushBadgeCount] failed:", err);
  }
}

/**
 * Sync exact unread count to customer + provider OneSignal apps (best-effort).
 * Omit `unreadCount` to read from the database after a read/mark-all mutation.
 */
export async function syncPushBadgeCountAllApps(
  userId: string,
  unreadCount?: number,
): Promise<void> {
  const [customerUnread, providerUnread] = await Promise.all([
    typeof unreadCount === "number"
      ? exactIosBadgeCount(unreadCount)
      : exactIosBadgeCount(await getTotalUnreadBadgeCount(userId, "customer")),
    typeof unreadCount === "number"
      ? exactIosBadgeCount(unreadCount)
      : exactIosBadgeCount(await getTotalUnreadBadgeCount(userId, "provider")),
  ]);

  await Promise.all([
    syncPushBadgeCount(userId, { appType: "customer", unreadCount: customerUnread }),
    syncPushBadgeCount(userId, { appType: "provider", unreadCount: providerUnread }),
  ]);
}
