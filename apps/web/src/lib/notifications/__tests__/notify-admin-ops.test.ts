import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSupabaseAdmin = vi.fn();
const mockInsertNotifications = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => mockGetSupabaseAdmin(),
}));

vi.mock("@/lib/notifications/insert-notification", () => ({
  insertNotifications: (...args: unknown[]) => mockInsertNotifications(...args),
}));

import { notifyAdminOps, resolveAdminUserIdsByRoles } from "../notify-admin-ops";

describe("notifyAdminOps", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInsertNotifications.mockResolvedValue(undefined);
  });

  it("resolves recipients by role and inserts one row per user", async () => {
    mockGetSupabaseAdmin.mockReturnValue({
      from: () => ({
        select: () => ({
          in: () => ({
            limit: async () => ({
              data: [{ id: "u1" }, { id: "u2" }],
              error: null,
            }),
          }),
        }),
      }),
    });

    const result = await notifyAdminOps({
      roles: ["superadmin"],
      type: "agent_proposal",
      title: "Proposal",
      message: "Needs approval",
      link: "/admin/control-plane/modules/agents",
    });

    expect(result).toEqual({ inserted: 2, skipped: false });
    expect(mockInsertNotifications).toHaveBeenCalledWith([
      expect.objectContaining({ user_id: "u1", type: "agent_proposal" }),
      expect.objectContaining({ user_id: "u2", type: "agent_proposal" }),
    ]);
  });

  it("skips insert when no recipients match", async () => {
    mockGetSupabaseAdmin.mockReturnValue({
      from: () => ({
        select: () => ({
          in: () => ({
            limit: async () => ({ data: [], error: null }),
          }),
        }),
      }),
    });

    const result = await notifyAdminOps({
      roles: ["support_agent"],
      type: "support_queue",
      title: "Queue",
      message: "Ticket waiting",
      link: "/admin/support-tickets",
    });

    expect(result).toEqual({ inserted: 0, skipped: true });
    expect(mockInsertNotifications).not.toHaveBeenCalled();
  });

  it("returns empty list when recipient lookup fails", async () => {
    mockGetSupabaseAdmin.mockReturnValue({
      from: () => ({
        select: () => ({
          in: () => ({
            limit: async () => ({ data: null, error: { message: "db down" } }),
          }),
        }),
      }),
    });

    const ids = await resolveAdminUserIdsByRoles(["superadmin"]);
    expect(ids).toEqual([]);
  });

  it("delegates insert to insertNotifications without swallowing await", async () => {
    mockGetSupabaseAdmin.mockReturnValue({
      from: () => ({
        select: () => ({
          in: () => ({
            limit: async () => ({ data: [{ id: "u1" }], error: null }),
          }),
        }),
      }),
    });
    mockInsertNotifications.mockResolvedValue(undefined);

    await notifyAdminOps({
      roles: ["superadmin"],
      type: "admin_ops_alert",
      title: "Alert",
      message: "Something happened",
      link: "/admin/dashboard",
    });

    expect(mockInsertNotifications).toHaveBeenCalledTimes(1);
  });
});
