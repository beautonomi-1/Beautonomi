import { describe, expect, it, vi } from "vitest";
import { materializeCustomerNotificationPreferences } from "@/lib/notifications/materialize-notification-preferences";
import { getCustomerNotificationDefaults } from "@/lib/notifications/notification-preferences-defaults";

describe("materializeCustomerNotificationPreferences", () => {
  it("persists defaults and syncs rollup when profile prefs are empty", async () => {
    const userUpdate = vi.fn().mockResolvedValue({ error: null });
    const profileUpdate = vi.fn().mockResolvedValue({ error: null });
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "user_profiles") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: { id: "p1" } }),
              }),
            }),
            update: profileUpdate.mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
            insert: vi.fn(),
          };
        }
        if (table === "users") {
          return { update: userUpdate.mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) };
        }
        throw new Error(table);
      }),
    };

    const out = await materializeCustomerNotificationPreferences(
      supabase as never,
      "user-1",
      null,
      { marketingConsented: false },
    );

    expect(out).toEqual(getCustomerNotificationDefaults({ marketingConsented: false }));
    expect(profileUpdate).toHaveBeenCalled();
    expect(userUpdate).toHaveBeenCalled();
  });

  it("returns existing prefs without writing when already materialized", async () => {
    const existing = getCustomerNotificationDefaults({ marketingConsented: true });
    const profileUpdate = vi.fn();
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(),
        update: profileUpdate,
      })),
    };

    const out = await materializeCustomerNotificationPreferences(
      supabase as never,
      "user-1",
      existing,
    );

    expect(out).toBe(existing);
    expect(profileUpdate).not.toHaveBeenCalled();
  });
});
