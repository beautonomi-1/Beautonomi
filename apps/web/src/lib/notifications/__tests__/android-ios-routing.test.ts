/**
 * Native delivery routing tests (§Notification-QA-hardening D1/D2).
 *
 * Verifies that push payloads carry:
 *   - `existing_android_channel_id` matching the per-category Android channels
 *     both apps register in push-notifications-setup.ts, and
 *   - `ios_category` + `buttons` matching the iOS categories both apps register
 *     via setNotificationCategoryAsync (Accept/Decline, Mark as read).
 *
 * We drive this through `sendToUsers` and inspect the JSON body posted to
 * OneSignal — the same path template sends and broadcasts take in production.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const hoisted = vi.hoisted(() => ({
  getSupabaseAdminMock: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: hoisted.getSupabaseAdminMock,
}));

vi.mock("@/lib/platform/secrets", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/platform/secrets")>();
  return {
    ...actual,
    resolveOneSignalCredentials: vi.fn().mockResolvedValue({
      appId: "11111111-1111-1111-1111-111111111111",
      restKey: "test-rest-key",
    }),
  };
});

function mockAdmin(deviceRows: { onesignal_player_id: string | null; user_id: string }[]) {
  const result = Promise.resolve({ data: deviceRows, error: null });
  const orFn = vi.fn().mockReturnValue(result);
  const eqFn = vi.fn().mockReturnValue({ or: orFn, then: result.then.bind(result) });
  const inFn = vi.fn().mockReturnValue({
    or: orFn,
    eq: eqFn,
    then: result.then.bind(result),
    catch: result.catch.bind(result),
  });
  const selectFn = vi.fn().mockReturnValue({ in: inFn, eq: eqFn });
  const notifCountResult = Promise.resolve({ count: 1, error: null });
  const from = vi.fn().mockImplementation((table: string) => {
    if (table === "user_devices") return { select: selectFn };
    if (table === "notifications") {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue(notifCountResult),
          }),
        }),
      };
    }
    if (table === "notification_logs") return { insert: vi.fn().mockResolvedValue({ error: null }) };
    throw new Error("unexpected table " + table);
  });
  return { from };
}

function lastFetchBody(): Record<string, unknown> {
  const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
  const call = fetchMock.mock.calls.at(-1);
  if (!call) throw new Error("fetch was not called");
  const init = call[1] as { body?: string };
  return JSON.parse(String(init.body ?? "{}")) as Record<string, unknown>;
}

describe("native push routing: Android channels + iOS categories", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ id: "msg-id", recipients: 1 }),
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    hoisted.getSupabaseAdminMock.mockReset();
  });

  it("routes message pushes to the 'messages' channel + MESSAGE category with a mark_read button", async () => {
    hoisted.getSupabaseAdminMock.mockReturnValue(
      mockAdmin([{ onesignal_player_id: "sub-1", user_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" }]),
    );

    const { sendToUsers } = await import("@/lib/notifications/onesignal");
    await sendToUsers(
      ["aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"],
      { title: "T", message: "M", type: "test", data: { template_key: "customer_new_message" } },
      ["push"],
      { appType: "customer" },
    );

    const body = lastFetchBody();
    expect(body.existing_android_channel_id).toBe("messages");
    expect(body.ios_category).toBe("MESSAGE");
    expect(body.buttons).toEqual([{ id: "mark_read", text: "Mark as read" }]);
  });

  it("routes provider new-booking pushes to 'bookings' + PROVIDER_BOOKING_REQUEST with accept/decline", async () => {
    hoisted.getSupabaseAdminMock.mockReturnValue(
      mockAdmin([{ onesignal_player_id: "sub-2", user_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" }]),
    );

    const { sendToUsers } = await import("@/lib/notifications/onesignal");
    await sendToUsers(
      ["bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"],
      { title: "T", message: "M", type: "test", data: { template_key: "new_booking" } },
      ["push"],
      { appType: "provider" },
    );

    const body = lastFetchBody();
    expect(body.existing_android_channel_id).toBe("bookings");
    expect(body.ios_category).toBe("PROVIDER_BOOKING_REQUEST");
    expect(body.buttons).toEqual([
      { id: "accept_booking", text: "Accept" },
      { id: "decline_booking", text: "Decline" },
    ]);
  });

  it("routes payment pushes to the 'payments' channel (no actionable category)", async () => {
    hoisted.getSupabaseAdminMock.mockReturnValue(
      mockAdmin([{ onesignal_player_id: "sub-3", user_id: "cccccccc-cccc-cccc-cccc-cccccccccccc" }]),
    );

    const { sendToUsers } = await import("@/lib/notifications/onesignal");
    await sendToUsers(
      ["cccccccc-cccc-cccc-cccc-cccccccccccc"],
      { title: "T", message: "M", type: "test", data: { template_key: "payment_successful" } },
      ["push"],
      { appType: "customer" },
    );

    const body = lastFetchBody();
    expect(body.existing_android_channel_id).toBe("payments");
    expect(body.ios_category).toBeUndefined();
    expect(body.buttons).toBeUndefined();
  });

  it("falls back to the 'default' channel when no type/template hints are present", async () => {
    hoisted.getSupabaseAdminMock.mockReturnValue(
      mockAdmin([{ onesignal_player_id: "sub-4", user_id: "dddddddd-dddd-dddd-dddd-dddddddddddd" }]),
    );

    const { sendToUsers } = await import("@/lib/notifications/onesignal");
    await sendToUsers(
      ["dddddddd-dddd-dddd-dddd-dddddddddddd"],
      { title: "T", message: "M", type: "test" },
      ["push"],
      { appType: "customer" },
    );

    const body = lastFetchBody();
    expect(body.existing_android_channel_id).toBe("default");
  });
});
