import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const USER_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

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

vi.mock("@/lib/notifications/customer-notification-channels", () => ({
  intersectChannelsForCustomerRecipients: vi.fn().mockResolvedValue(["push"]),
  templateKeyToPreferenceSection: vi.fn().mockReturnValue("bookings"),
}));

vi.mock("@/lib/notifications/provider-notification-channels", () => ({
  intersectChannelsForProviderRecipients: vi.fn().mockResolvedValue(["push"]),
}));

vi.mock("@/lib/notifications/insert-notification", () => ({
  insertNotifications: vi.fn().mockResolvedValue(undefined),
  getUnreadNotificationCount: vi.fn().mockResolvedValue(2),
}));

vi.mock("@/lib/notifications/total-unread-badge", () => ({
  getTotalUnreadBadgeCount: vi.fn().mockResolvedValue(2),
}));

function mockAdminNoTemplate(deviceRows: { onesignal_player_id: string | null }[]) {
  const devicesResult = Promise.resolve({ data: deviceRows, error: null });
  const templateQuery = {
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
  const from = vi.fn().mockImplementation((table: string) => {
    if (table === "notification_templates") {
      return { select: vi.fn().mockReturnValue(templateQuery) };
    }
    if (table === "user_devices") {
      return {
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockReturnValue({
            or: vi.fn().mockReturnValue(devicesResult),
            eq: vi.fn().mockReturnValue(devicesResult),
            then: devicesResult.then.bind(devicesResult),
          }),
        }),
      };
    }
    if (table === "notifications") {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ count: 1, error: null }),
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

describe("sendTemplateNotification must-deliver fallback", () => {
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

  it("still sends push when template row is missing for must-deliver keys", async () => {
    hoisted.getSupabaseAdminMock.mockReturnValue(
      mockAdminNoTemplate([{ onesignal_player_id: "sub-1" }]),
    );

    const { sendTemplateNotification } = await import("@/lib/notifications/onesignal");
    const result = await sendTemplateNotification(
      "booking_confirmed",
      [USER_ID],
      {
        provider_name: "Salon",
        booking_date: "Jun 14",
        booking_time: "10:00",
        booking_id: "b1",
      },
      ["push"],
      { appType: "customer" },
    );

    expect(result.success).toBe(true);
    const body = lastFetchBody();
    expect(body.url).toBeUndefined();
    expect((body.data as Record<string, unknown>).deep_link).toBe("/bookings/b1");
    expect(body.contents).toEqual({ en: expect.stringContaining("Salon") });
  });

  it("returns failure for missing marketing template", async () => {
    hoisted.getSupabaseAdminMock.mockReturnValue(mockAdminNoTemplate([]));

    const { sendTemplateNotification } = await import("@/lib/notifications/onesignal");
    const result = await sendTemplateNotification(
      "promotion_available",
      [USER_ID],
      {},
      ["push"],
      { appType: "customer" },
    );

    expect(result.success).toBe(false);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
