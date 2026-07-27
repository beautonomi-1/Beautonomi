/**
 * §Notifications-audit 2026-05: insert-notification.ts must:
 *   1. Pass through enum values guaranteed by migration 413 unchanged.
 *   2. Try the new (570) values first, and fall back to a 413-safe value
 *      when the DB rejects with `invalid_text_representation` (i.e. the
 *      migration has not yet run on that environment).
 *   3. Never throw. Errors are logged so the caller — usually a webhook
 *      or background worker — keeps making progress.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const hoisted = vi.hoisted(() => ({
  getSupabaseAdminMock: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: hoisted.getSupabaseAdminMock,
}));

type Insert = (rows: unknown) => Promise<{ error: unknown }>;

function mockAdminWithInsert(impl: (call: number, rows: unknown) => Promise<{ error: unknown }>) {
  let call = 0;
  const insert: Insert = async (rows) => impl(++call, rows);
  return {
    from: vi.fn().mockImplementation((table: string) => {
      if (table !== "notifications") throw new Error("unexpected table " + table);
      return { insert };
    }),
  };
}

const enumError = {
  code: "22P02",
  message: 'invalid input value for enum notification_type: "admin_broadcast"',
};

describe("insertNotification — enum fallback", () => {
  beforeEach(() => {
    hoisted.getSupabaseAdminMock.mockReset();
  });
  afterEach(() => {
    hoisted.getSupabaseAdminMock.mockReset();
  });

  it("inserts 413-safe values without modification", async () => {
    const seen: { type: string }[] = [];
    hoisted.getSupabaseAdminMock.mockReturnValue(
      mockAdminWithInsert(async (_n, rows) => {
        seen.push(rows as { type: string });
        return { error: null };
      }),
    );
    const { insertNotification } = await import("@/lib/notifications/insert-notification");
    await insertNotification({
      user_id: "11111111-1111-1111-1111-111111111111",
      type: "booking_reminder",
      title: "Reminder",
      message: "...",
    });
    expect(seen[0]?.type).toBe("booking_reminder");
  });

  it("retries with a 413-safe fallback when the DB rejects a 570-only enum value", async () => {
    const calls: { type: string }[] = [];
    hoisted.getSupabaseAdminMock.mockReturnValue(
      mockAdminWithInsert(async (n, rows) => {
        calls.push(rows as { type: string });
        if (n === 1) return { error: enumError };
        return { error: null };
      }),
    );

    const { insertNotification } = await import("@/lib/notifications/insert-notification");
    await insertNotification({
      user_id: "22222222-2222-2222-2222-222222222222",
      type: "admin_broadcast",
      title: "Hi",
      message: "Body",
    });

    expect(calls).toHaveLength(2);
    expect(calls[0]?.type).toBe("admin_broadcast");
    expect(calls[1]?.type).toBe("system"); // fallback for admin_broadcast
  });

  it("downgrades batch insert when one row's type is rejected", async () => {
    const calls: unknown[][] = [];
    hoisted.getSupabaseAdminMock.mockReturnValue(
      mockAdminWithInsert(async (n, rows) => {
        calls.push(rows as unknown[]);
        if (n === 1) return { error: enumError };
        return { error: null };
      }),
    );

    const { insertNotifications } = await import("@/lib/notifications/insert-notification");
    await insertNotifications([
      {
        user_id: "33333333-3333-3333-3333-333333333333",
        type: "booking_reminder",
        title: "Ok",
        message: "Already 413-safe",
      },
      {
        user_id: "44444444-4444-4444-4444-444444444444",
        type: "payment_request",
        title: "Pay request",
        message: "...",
      },
    ]);

    // First attempt has the original types; retry has the downgraded types.
    const firstAttempt = calls[0] as { type: string }[];
    const retry = calls[1] as { type: string }[];
    expect(firstAttempt[1]?.type).toBe("payment_request");
    expect(retry[1]?.type).toBe("payment_received");
  });

  it("maps product_order_cancelled to product_order_update enum value", async () => {
    const seen: { type: string }[] = [];
    hoisted.getSupabaseAdminMock.mockReturnValue(
      mockAdminWithInsert(async (_n, rows) => {
        seen.push(rows as { type: string });
        return { error: null };
      }),
    );
    const { insertNotification } = await import("@/lib/notifications/insert-notification");
    await insertNotification({
      user_id: "55555555-5555-5555-5555-555555555555",
      type: "product_order_cancelled",
      title: "Order Cancelled",
      message: "Your order was cancelled.",
    });
    expect(seen[0]?.type).toBe("product_order_update");
  });
});
