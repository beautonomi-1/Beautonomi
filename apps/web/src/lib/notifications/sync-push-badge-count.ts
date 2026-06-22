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
  revertBadgeSyncClaim,
  tryClaimBadgeSyncSend,
} from "@/lib/notifications/badge-sync-state";
import { isAnyProviderPushSectionEnabled } from "@/lib/notifications/provider-notification-channels";
import type { OneSignalAppType } from "@/lib/platform/secrets";

type SyncPushBadgeOptions = {
  appType?: OneSignalAppType;
  tenantId?: string | null;
  /** When omitted, reads current unread count from the database. */
  unreadCount?: number;
};

/** Coalesce mark-read bursts (chat open fires conversation read + mark-related-read). */
const ALL_APPS_DEBOUNCE_MS = 800;

/** Last-resort guard when dedupe state cannot persist (missing migration / DB error). */
const SAME_COUNT_COOLDOWN_MS = 4000;

const pendingAllAppsSync = new Map<
  string,
  {
    timer: ReturnType<typeof setTimeout>;
    promise: Promise<void>;
    resolve: () => void;
    unreadCount?: number;
    tenantId?: string | null | undefined;
  }
>();

const recentSuccessfulSendAt = new Map<string, number>();

function sendCooldownKey(userId: string, appType: OneSignalAppType, count: number): string {
  return `${userId}:${appType}:${count}`;
}

function isWithinSameCountCooldown(
  userId: string,
  appType: OneSignalAppType,
  count: number,
): boolean {
  const at = recentSuccessfulSendAt.get(sendCooldownKey(userId, appType, count));
  return at !== undefined && Date.now() - at < SAME_COUNT_COOLDOWN_MS;
}

function markSameCountSent(userId: string, appType: OneSignalAppType, count: number): void {
  recentSuccessfulSendAt.set(sendCooldownKey(userId, appType, count), Date.now());
}

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

    if (isWithinSameCountCooldown(userId, appType, unread)) return;

    const claim = await tryClaimBadgeSyncSend(userId, appType, unread);
    if (!claim.claimed) return;

    const result = await sendToUser(
      userId,
      {
        title: "",
        message: "",
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
      markSameCountSent(userId, appType, unread);
    } else {
      await revertBadgeSyncClaim(userId, appType, claim.previousCount);
    }
  } catch (err) {
    console.warn("[syncPushBadgeCount] failed:", err);
  }
}

function clearBadgeSyncCooldownForUser(userId: string): void {
  const prefix = `${userId.trim()}:`;
  for (const key of recentSuccessfulSendAt.keys()) {
    if (key.startsWith(prefix)) recentSuccessfulSendAt.delete(key);
  }
}

export async function syncPushBadgeCountAllAppsNow(
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

/**
 * Sync exact unread count to customer + provider OneSignal apps (best-effort).
 * Omit `unreadCount` to read from the database after a read/mark-all mutation.
 * Only targets apps where the user has a registered device; skips unchanged counts.
 * Debounces concurrent callers so chat open (conversation read + mark-related-read)
 * produces at most one sync burst per user.
 */
export async function syncPushBadgeCountAllApps(
  userId: string,
  unreadCount?: number,
  tenantId?: string | null,
): Promise<void> {
  const key = userId.trim();
  if (!key) return Promise.resolve();

  const existing = pendingAllAppsSync.get(key);
  if (existing) {
    clearTimeout(existing.timer);
    if (typeof unreadCount === "number") existing.unreadCount = unreadCount;
    if (tenantId !== undefined) existing.tenantId = tenantId;
    existing.timer = setTimeout(async () => {
      pendingAllAppsSync.delete(key);
      try {
        await syncPushBadgeCountAllAppsNow(key, existing.unreadCount, existing.tenantId);
      } finally {
        existing.resolve();
      }
    }, ALL_APPS_DEBOUNCE_MS);
    return existing.promise;
  }

  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });

  const entry = {
    timer: setTimeout(async () => {
      pendingAllAppsSync.delete(key);
      try {
        await syncPushBadgeCountAllAppsNow(key, unreadCount, tenantId);
      } finally {
        resolve();
      }
    }, ALL_APPS_DEBOUNCE_MS),
    promise,
    resolve,
    unreadCount,
    tenantId,
  };
  pendingAllAppsSync.set(key, entry);
  return promise;
}

/**
 * Run badge sync immediately (no debounce). Use after mark-all-read so the OS
 * badge baseline resets before the next notification arrives.
 */
export async function syncPushBadgeCountAllAppsImmediate(
  userId: string,
  unreadCount?: number,
  tenantId?: string | null,
): Promise<void> {
  const key = userId.trim();
  if (!key) return;

  const pending = pendingAllAppsSync.get(key);
  if (pending) {
    clearTimeout(pending.timer);
    pendingAllAppsSync.delete(key);
    pending.resolve();
  }
  clearBadgeSyncCooldownForUser(key);
  await syncPushBadgeCountAllAppsNow(key, unreadCount, tenantId);
}

/** @internal Vitest-only reset for module-level debounce/cooldown maps. */
export function resetSyncPushBadgeStateForTests(): void {
  pendingAllAppsSync.clear();
  recentSuccessfulSendAt.clear();
}
