import { describe, expect, it, vi, beforeEach } from "vitest";

const hoisted = vi.hoisted(() => ({
  getTotalUnreadBadgeCountMock: vi.fn(),
  sendToUserMock: vi.fn(),
}));

vi.mock("@/lib/notifications/total-unread-badge", () => ({
  getTotalUnreadBadgeCount: hoisted.getTotalUnreadBadgeCountMock,
}));

vi.mock("@/lib/notifications/onesignal", () => ({
  sendToUser: hoisted.sendToUserMock,
}));

describe("syncPushBadgeCountAllApps unified totals", () => {
  beforeEach(() => {
    hoisted.getTotalUnreadBadgeCountMock.mockReset();
    hoisted.sendToUserMock.mockReset();
    hoisted.sendToUserMock.mockResolvedValue({ success: true });
  });

  it("pushes per-app totals to customer and provider OneSignal apps", async () => {
    hoisted.getTotalUnreadBadgeCountMock.mockImplementation(async (_uid, appType) =>
      appType === "customer" ? 7 : 11,
    );

    const { syncPushBadgeCountAllApps } = await import("@/lib/notifications/sync-push-badge-count");
    await syncPushBadgeCountAllApps("user-1");

    expect(hoisted.sendToUserMock).toHaveBeenCalledTimes(2);
    const customerCall = hoisted.sendToUserMock.mock.calls.find((c) => c[3]?.appType === "customer");
    const providerCall = hoisted.sendToUserMock.mock.calls.find((c) => c[3]?.appType === "provider");
    expect(customerCall?.[1]?.ios_badgeCount).toBe(7);
    expect(providerCall?.[1]?.ios_badgeCount).toBe(11);
  });
});
