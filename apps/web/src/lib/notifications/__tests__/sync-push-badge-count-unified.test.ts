import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const hoisted = vi.hoisted(() => ({
  getTotalUnreadBadgeCountMock: vi.fn(),
  sendToUserMock: vi.fn(),
  deviceAppTypes: [] as Array<"customer" | "provider" | null>,
  badgeStateRows: new Map<string, number>(),
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

function mockClaimRpc(args: { p_user_id: string; p_app_type: string; p_count: number }) {
  const key = stateKey(args.p_user_id, args.p_app_type);
  const prev = hoisted.badgeStateRows.get(key);
  if (prev === args.p_count) {
    return { data: { claimed: false, previous_count: prev }, error: null };
  }
  hoisted.badgeStateRows.set(key, args.p_count);
  return { data: { claimed: true, previous_count: prev ?? null }, error: null };
}

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn(() => ({
    rpc: (name: string, args: { p_user_id: string; p_app_type: string; p_count: number }) => {
      if (name === "try_claim_badge_sync_send") {
        return Promise.resolve(mockClaimRpc(args));
      }
      return Promise.resolve({ data: null, error: new Error(`unexpected rpc ${name}`) });
    },
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
          delete: () => ({
            eq: (_col: string, userId: string) => ({
              eq: (_col2: string, appType: string) =>
                Promise.resolve({
                  error: (() => {
                    hoisted.badgeStateRows.delete(stateKey(userId, appType));
                    return null;
                  })(),
                }),
            }),
          }),
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
                data: { push_notifications_enabled: true },
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
              maybeSingle: async () => ({ data: { notification_preferences: null }, error: null }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  })),
}));

describe("syncPushBadgeCountAllApps unified totals", () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules();
    hoisted.getTotalUnreadBadgeCountMock.mockReset();
    hoisted.sendToUserMock.mockReset();
    hoisted.badgeStateRows.clear();
    hoisted.deviceAppTypes = ["customer", "provider"];
    hoisted.sendToUserMock.mockResolvedValue({ success: true });
    const mod = await import("@/lib/notifications/sync-push-badge-count");
    mod.resetSyncPushBadgeStateForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("pushes per-app totals to customer and provider OneSignal apps", async () => {
    hoisted.getTotalUnreadBadgeCountMock.mockImplementation(async (_uid, appType) =>
      appType === "customer" ? 7 : 11,
    );

    const { syncPushBadgeCountAllApps } = await import("@/lib/notifications/sync-push-badge-count");
    const pending = syncPushBadgeCountAllApps("user-1");
    await vi.advanceTimersByTimeAsync(800);
    await pending;

    expect(hoisted.sendToUserMock).toHaveBeenCalledTimes(2);
    const customerCall = hoisted.sendToUserMock.mock.calls.find((c) => c[3]?.appType === "customer");
    const providerCall = hoisted.sendToUserMock.mock.calls.find((c) => c[3]?.appType === "provider");
    expect(customerCall?.[1]?.ios_badgeCount).toBe(7);
    expect(providerCall?.[1]?.ios_badgeCount).toBe(11);
    expect(customerCall?.[3]?.tenantId).toBe("tenant-za");
    expect(providerCall?.[3]?.tenantId).toBe("tenant-za");
  });
});
