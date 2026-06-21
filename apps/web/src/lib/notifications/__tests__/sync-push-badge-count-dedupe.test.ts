import { describe, expect, it, vi, beforeEach } from "vitest";

const hoisted = vi.hoisted(() => ({
  getTotalUnreadBadgeCountMock: vi.fn(),
  sendToUserMock: vi.fn(),
  badgeStateRows: new Map<string, number>(),
  deviceAppTypes: [] as Array<"customer" | "provider">,
  customerPushEnabled: true as boolean,
  providerPrefs: null as Record<string, unknown> | null,
}));

vi.mock("@/lib/notifications/total-unread-badge", () => ({
  getTotalUnreadBadgeCount: hoisted.getTotalUnreadBadgeCountMock,
}));

vi.mock("@/lib/notifications/onesignal", () => ({
  sendToUser: hoisted.sendToUserMock,
}));

vi.mock("@/lib/notifications/resolve-tenant-for-push", () => ({
  resolveTenantIdForPush: vi.fn().mockResolvedValue("tenant-za"),
}));

function stateKey(userId: string, appType: string) {
  return `${userId}:${appType}`;
}

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn(() => ({
    from: (table: string) => {
      if (table === "user_badge_sync_state") {
        return {
          select: () => ({
            eq: (_col: string, userId: string) => ({
              eq: (_col2: string, appType: string) => ({
                maybeSingle: async () => {
                  const last = hoisted.badgeStateRows.get(stateKey(userId, appType));
                  return {
                    data: last === undefined ? null : { last_count: last },
                    error: null,
                  };
                },
              }),
            }),
          }),
          upsert: async (row: { user_id: string; app_type: string; last_count: number }) => {
            hoisted.badgeStateRows.set(stateKey(row.user_id, row.app_type), row.last_count);
            return { error: null };
          },
        };
      }
      if (table === "user_devices") {
        return {
          select: () => ({
            eq: () =>
              Promise.resolve({
                data: hoisted.deviceAppTypes.map((app_type) => ({ app_type })),
                error: null,
              }),
          }),
        };
      }
      if (table === "users") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { push_notifications_enabled: hoisted.customerPushEnabled },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "user_profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { notification_preferences: hoisted.providerPrefs },
                error: null,
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  })),
}));

describe("syncPushBadgeCount dedupe and app scoping", () => {
  beforeEach(() => {
    hoisted.getTotalUnreadBadgeCountMock.mockReset();
    hoisted.sendToUserMock.mockReset();
    hoisted.badgeStateRows.clear();
    hoisted.deviceAppTypes = ["customer", "provider"];
    hoisted.customerPushEnabled = true;
    hoisted.providerPrefs = null;
    hoisted.sendToUserMock.mockResolvedValue({ success: true });
    hoisted.getTotalUnreadBadgeCountMock.mockImplementation(async (_uid, appType) =>
      appType === "customer" ? 3 : 5,
    );
  });

  it("skips OneSignal when last_count matches current unread", async () => {
    hoisted.badgeStateRows.set(stateKey("user-1", "customer"), 3);
    hoisted.badgeStateRows.set(stateKey("user-1", "provider"), 5);
    hoisted.deviceAppTypes = ["customer"];

    const { syncPushBadgeCount } = await import("@/lib/notifications/sync-push-badge-count");
    await syncPushBadgeCount("user-1", { appType: "customer", unreadCount: 3 });

    expect(hoisted.sendToUserMock).not.toHaveBeenCalled();
  });

  it("sends and records state when count changes", async () => {
    hoisted.badgeStateRows.set(stateKey("user-1", "customer"), 5);

    const { syncPushBadgeCount } = await import("@/lib/notifications/sync-push-badge-count");
    await syncPushBadgeCount("user-1", { appType: "customer", unreadCount: 3 });

    expect(hoisted.sendToUserMock).toHaveBeenCalledTimes(1);
    expect(hoisted.badgeStateRows.get(stateKey("user-1", "customer"))).toBe(3);
  });

  it("does not record state when send fails", async () => {
    hoisted.sendToUserMock.mockResolvedValue({ success: false });

    const { syncPushBadgeCount } = await import("@/lib/notifications/sync-push-badge-count");
    await syncPushBadgeCount("user-1", { appType: "customer", unreadCount: 2 });

    expect(hoisted.sendToUserMock).toHaveBeenCalledTimes(1);
    expect(hoisted.badgeStateRows.has(stateKey("user-1", "customer"))).toBe(false);
  });

  it("syncPushBadgeCountAllApps only targets registered app types", async () => {
    hoisted.deviceAppTypes = ["customer"];

    const { syncPushBadgeCountAllApps } = await import("@/lib/notifications/sync-push-badge-count");
    await syncPushBadgeCountAllApps("user-1");

    expect(hoisted.sendToUserMock).toHaveBeenCalledTimes(1);
    expect(hoisted.sendToUserMock.mock.calls[0]?.[3]?.appType).toBe("customer");
  });

  it("skips when the customer disabled push notifications", async () => {
    hoisted.customerPushEnabled = false;
    hoisted.deviceAppTypes = ["customer"];

    const { syncPushBadgeCount } = await import("@/lib/notifications/sync-push-badge-count");
    await syncPushBadgeCount("user-1", { appType: "customer", unreadCount: 3 });

    expect(hoisted.sendToUserMock).not.toHaveBeenCalled();
  });

  it("skips when the provider disabled push across every section", async () => {
    hoisted.providerPrefs = {
      booking_updates: { push: false },
      booking_cancellations: { push: false },
      booking_reminders: { push: false },
      new_reviews: { push: false },
      review_responses: { push: false },
      client_messages: { push: false },
      payment_received: { push: false },
      payout_updates: { push: false },
      waitlist_notifications: { push: false },
      system_updates: { push: false },
      marketing: { push: false },
    };

    const { syncPushBadgeCount } = await import("@/lib/notifications/sync-push-badge-count");
    await syncPushBadgeCount("user-1", { appType: "provider", unreadCount: 5 });

    expect(hoisted.sendToUserMock).not.toHaveBeenCalled();
  });

  it("still sends to provider when at least one push section is enabled", async () => {
    hoisted.providerPrefs = { marketing: { push: false } };

    const { syncPushBadgeCount } = await import("@/lib/notifications/sync-push-badge-count");
    await syncPushBadgeCount("user-1", { appType: "provider", unreadCount: 5 });

    expect(hoisted.sendToUserMock).toHaveBeenCalledTimes(1);
  });
});
