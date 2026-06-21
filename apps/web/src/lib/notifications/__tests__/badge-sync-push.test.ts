import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const hoisted = vi.hoisted(() => ({
  getSupabaseAdminMock: vi.fn(),
  badgeStateUpserts: [] as Array<{ user_id: string; app_type: string; last_count: number }>,
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

function mockAdminNoDevices() {
  const emptyDevices = Promise.resolve({ data: [], error: null });
  const deviceEqTail = vi.fn().mockReturnValue(emptyDevices);
  const deviceOr = vi.fn().mockReturnValue(emptyDevices);
  const deviceEq = vi.fn().mockReturnValue({ or: deviceOr, then: emptyDevices.then.bind(emptyDevices) });
  const headCount = vi.fn().mockResolvedValue({ count: 0, error: null });
  const from = vi.fn().mockImplementation((table: string) => {
    if (table === "user_devices") {
      return { select: vi.fn().mockReturnValue({ eq: deviceEq }) };
    }
    if (table === "notifications") {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue(headCount),
          }),
        }),
      };
    }
    if (table === "notification_logs") return { insert: vi.fn().mockResolvedValue({ error: null }) };
    if (table === "user_badge_sync_state") {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({ maybeSingle: async () => ({ data: null, error: null }) }),
          }),
        }),
        upsert: async (row: { user_id: string; app_type: string; last_count: number }) => {
          hoisted.badgeStateUpserts.push(row);
          return { error: null };
        },
      };
    }
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

describe("badge sync push", () => {
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
    hoisted.badgeStateUpserts.length = 0;
  });

  it("isBadgeSyncPayload detects badge_sync rows", async () => {
    const { isBadgeSyncPayload } = await import("@/lib/notifications/onesignal");
    expect(isBadgeSyncPayload({ title: "x", message: "y", type: "badge_sync" })).toBe(true);
    expect(
      isBadgeSyncPayload({
        title: "x",
        message: "y",
        data: { type: "badge_sync" },
      }),
    ).toBe(true);
    expect(isBadgeSyncPayload({ title: "x", message: "y", type: "booking_confirmed" })).toBe(false);
  });

  it("sendToUser badge_sync sets ios_badgeCount 0 and content_available without default sound", async () => {
    hoisted.getSupabaseAdminMock.mockReturnValue(mockAdminNoDevices());

    const { sendToUser } = await import("@/lib/notifications/onesignal");
    await sendToUser(
      "dddddddd-dddd-dddd-dddd-dddddddddddd",
      {
        title: "\u200b",
        message: "\u200b",
        type: "badge_sync",
        data: { type: "badge_sync", silent: true, unread_count: 0 },
        ios_badgeType: "SetTo",
        ios_badgeCount: 0,
        content_available: true,
        ios_interruption_level: "passive",
      },
      ["push"],
      { appType: "customer", skipMustDeliverRetryEnqueue: true },
    );

    const body = lastFetchBody();
    expect(body.ios_badgeType).toBe("SetTo");
    expect(body.ios_badgeCount).toBe(0);
    expect(body.content_available).toBe(true);
    expect(body.ios_interruption_level).toBe("passive");
    expect(body.ios_sound).toBeUndefined();
    expect(body.headings).toBeUndefined();
    expect(body.contents).toBeUndefined();
    expect(body.subtitle).toBeUndefined();
    expect(body.include_aliases).toEqual({
      external_id: ["dddddddd-dddd-dddd-dddd-dddddddddddd"],
    });
  });

  it("regular SetTo send records badge state so a later badge_sync isn't wrongly skipped", async () => {
    hoisted.getSupabaseAdminMock.mockReturnValue(mockAdminNoDevices());

    const { sendToUser } = await import("@/lib/notifications/onesignal");
    await sendToUser(
      "dddddddd-dddd-dddd-dddd-dddddddddddd",
      {
        title: "New message",
        message: "You have a new message",
        type: "message_received",
        ios_badgeCount: 1,
      },
      ["push"],
      { appType: "customer", skipMustDeliverRetryEnqueue: true },
    );

    expect(hoisted.badgeStateUpserts).toContainEqual(
      expect.objectContaining({
        user_id: "dddddddd-dddd-dddd-dddd-dddddddddddd",
        app_type: "customer",
        last_count: 1,
      }),
    );
  });
});
