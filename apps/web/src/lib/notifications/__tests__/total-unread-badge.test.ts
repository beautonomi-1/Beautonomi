import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const hoisted = vi.hoisted(() => ({
  getSupabaseAdminMock: vi.fn(),
  getUnreadNotificationCountMock: vi.fn(),
  getProviderIdForUserMock: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: hoisted.getSupabaseAdminMock,
}));

vi.mock("@/lib/notifications/insert-notification", () => ({
  getUnreadNotificationCount: hoisted.getUnreadNotificationCountMock,
}));

vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    getProviderIdForUser: hoisted.getProviderIdForUserMock,
  };
});

describe("getTotalUnreadBadgeCount", () => {
  beforeEach(() => {
    hoisted.getUnreadNotificationCountMock.mockReset();
    hoisted.getProviderIdForUserMock.mockReset();
  });

  it("sums notification and customer chat unread", async () => {
    hoisted.getUnreadNotificationCountMock.mockResolvedValue(3);
    hoisted.getSupabaseAdminMock.mockReturnValue({
      from: (table: string) => {
        if (table !== "conversations") throw new Error("unexpected " + table);
        return {
          select: () => ({
            eq: () => ({
              gt: () =>
                Promise.resolve({
                  data: [{ unread_count_customer: 2 }, { unread_count_customer: 1 }],
                  error: null,
                }),
            }),
          }),
        };
      },
    });

    const { getTotalUnreadBadgeCount } = await import("@/lib/notifications/total-unread-badge");
    await expect(getTotalUnreadBadgeCount("user-1", "customer")).resolves.toBe(6);
  });

  it("sums notification and provider chat unread", async () => {
    hoisted.getUnreadNotificationCountMock.mockResolvedValue(4);
    hoisted.getProviderIdForUserMock.mockResolvedValue("prov-1");
    hoisted.getSupabaseAdminMock.mockReturnValue({
      from: (table: string) => {
        if (table !== "conversations") throw new Error("unexpected " + table);
        return {
          select: () => ({
            eq: () => ({
              gt: () => ({
                or: () =>
                  Promise.resolve({
                    data: [{ unread_count_provider: 5 }],
                    error: null,
                  }),
              }),
            }),
          }),
        };
      },
    });

    const { getTotalUnreadBadgeCount } = await import("@/lib/notifications/total-unread-badge");
    await expect(getTotalUnreadBadgeCount("user-2", "provider")).resolves.toBe(9);
  });

  it("returns notification count only when provider has no conversations", async () => {
    hoisted.getUnreadNotificationCountMock.mockResolvedValue(2);
    hoisted.getProviderIdForUserMock.mockResolvedValue(null);

    const { getTotalUnreadBadgeCount } = await import("@/lib/notifications/total-unread-badge");
    await expect(getTotalUnreadBadgeCount("user-3", "provider")).resolves.toBe(2);
  });
});
