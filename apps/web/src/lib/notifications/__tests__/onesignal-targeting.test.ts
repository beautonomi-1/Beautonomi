/**
 * Targeting tests for `applyOneSignalTargeting`.
 *
 * §Notifications-audit 2026-05: regression coverage for the bug where the
 * helper sent BOTH `include_subscription_ids` and `include_external_user_ids`
 * in the same request, which OneSignal v9/v10 doesn't support reliably.
 * The new contract is:
 *   1. external IDs + single channel  → `include_aliases.external_id` + `target_channel`
 *   2. external IDs + multi channel   → split into one Create Message request per channel (each uses alias + target_channel)
 *   3. only subscription IDs          → `include_subscription_ids`
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// We exercise the targeting via `sendToUsers` and capture the JSON body
// posted to OneSignal. That's the same path broadcasts and template sends
// take in production.
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
  const eqFn = vi.fn().mockReturnValue(result);
  const inFn = vi.fn().mockReturnValue({
    or: orFn,
    eq: eqFn,
    then: result.then.bind(result),
    catch: result.catch.bind(result),
  });
  const selectFn = vi.fn().mockReturnValue({ in: inFn });
  const from = vi.fn().mockImplementation((table: string) => {
    if (table === "user_devices") return { select: selectFn };
    if (table === "notification_logs") return { insert: vi.fn().mockResolvedValue({ error: null }) };
    throw new Error("unexpected table " + table);
  });
  return { from };
}

function lastFetchBody(): Record<string, unknown> {
  const fetchMock = (globalThis.fetch as unknown) as ReturnType<typeof vi.fn>;
  const call = fetchMock.mock.calls.at(-1);
  if (!call) throw new Error("fetch was not called");
  const init = call[1] as { body?: string };
  return JSON.parse(String(init.body ?? "{}")) as Record<string, unknown>;
}

describe("applyOneSignalTargeting (regression for sub+ext mix)", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ id: "msg-id", recipients: 3 }),
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    hoisted.getSupabaseAdminMock.mockReset();
  });

  it("uses include_aliases.external_id + target_channel for single-channel push when external IDs are present", async () => {
    hoisted.getSupabaseAdminMock.mockReturnValue(mockAdmin([
      { onesignal_player_id: "sub-1", user_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" },
    ]));

    const { sendToUsers } = await import("@/lib/notifications/onesignal");
    await sendToUsers(
      ["aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"],
      { title: "T", message: "M", type: "test" },
      ["push"],
      { appType: "customer" },
    );

    const body = lastFetchBody();
    expect(body.include_aliases).toEqual({ external_id: ["aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"] });
    expect(body.target_channel).toBe("push");
    expect(body.include_subscription_ids).toBeUndefined();
    expect(body.include_external_user_ids).toBeUndefined();
  });

  it("does not mix include_subscription_ids with external IDs (regression for OneSignal silent miss)", async () => {
    hoisted.getSupabaseAdminMock.mockReturnValue(mockAdmin([
      { onesignal_player_id: "sub-A", user_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" },
      { onesignal_player_id: "sub-B", user_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" },
    ]));

    const { sendToUsers } = await import("@/lib/notifications/onesignal");
    await sendToUsers(
      ["bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"],
      { title: "T", message: "M", type: "test" },
      ["push"],
      { appType: "customer" },
    );

    const body = lastFetchBody();
    expect(body.include_subscription_ids).toBeUndefined();
    expect(body.include_aliases).toBeDefined();
  });

  it("splits multi-channel sends into one request per channel (alias + target_channel each)", async () => {
    hoisted.getSupabaseAdminMock.mockReturnValue(mockAdmin([]));

    const { sendToUsers } = await import("@/lib/notifications/onesignal");
    await sendToUsers(
      ["cccccccc-cccc-cccc-cccc-cccccccccccc"],
      { title: "T", message: "M", type: "test" },
      ["push", "email"],
      { appType: "customer" },
    );

    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    expect(fetchMock.mock.calls.length).toBe(2);

    const bodyPush = JSON.parse(
      String((fetchMock.mock.calls[0][1] as { body?: string }).body ?? "{}"),
    ) as Record<string, unknown>;
    const bodyEmail = JSON.parse(
      String((fetchMock.mock.calls[1][1] as { body?: string }).body ?? "{}"),
    ) as Record<string, unknown>;

    expect(bodyPush.include_aliases).toEqual({ external_id: ["cccccccc-cccc-cccc-cccc-cccccccccccc"] });
    expect(bodyPush.target_channel).toBe("push");
    expect(bodyPush.include_external_user_ids).toBeUndefined();

    expect(bodyEmail.include_aliases).toEqual({ external_id: ["cccccccc-cccc-cccc-cccc-cccccccccccc"] });
    expect(bodyEmail.target_channel).toBe("email");
    expect(bodyEmail.include_external_user_ids).toBeUndefined();
  });
});
