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

vi.mock("@/lib/notifications/insert-notification", () => ({
  insertNotifications: vi.fn().mockResolvedValue(undefined),
  getUnreadNotificationCount: vi.fn().mockResolvedValue(1),
}));

function createSupabaseMock(templateKey: string, profilePrefs?: Record<string, unknown>) {
  const templateRow = {
    key: templateKey,
    title: "Template title",
    body: "Template body",
    channels: ["push"],
    enabled: true,
  };

  const templateQuery = {
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: templateRow, error: null }),
  };

  const profileResult = Promise.resolve({
    data: [
      {
        user_id: USER_ID,
        notification_preferences: profilePrefs ?? {
          quiet_hours_enabled: true,
          quiet_hours_start: "22:00",
          quiet_hours_end: "07:00",
        },
      },
    ],
    error: null,
  });

  const userProfilesQuery = {
    in: vi.fn().mockReturnValue(profileResult),
  };

  const usersResult = Promise.resolve({
    data: [
      {
        id: USER_ID,
        email_notifications_enabled: true,
        sms_notifications_enabled: true,
        push_notifications_enabled: true,
      },
    ],
    error: null,
  });

  const usersQuery = {
    in: vi.fn().mockReturnValue(usersResult),
  };

  const deviceResult = Promise.resolve({
    data: [{ onesignal_player_id: "sub-1" }],
    error: null,
  });

  const userDevicesQuery = {
    eq: vi.fn().mockReturnValue(deviceResult),
    or: vi.fn().mockReturnValue(deviceResult),
    then: deviceResult.then.bind(deviceResult),
    catch: deviceResult.catch.bind(deviceResult),
  };

  const userDevicesSelect = {
    in: vi.fn().mockReturnValue(userDevicesQuery),
  };

  return {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === "notification_templates") {
        return { select: vi.fn().mockReturnValue(templateQuery) };
      }
      if (table === "user_profiles") {
        return { select: vi.fn().mockReturnValue(userProfilesQuery) };
      }
      if (table === "users") {
        return { select: vi.fn().mockReturnValue(usersQuery) };
      }
      if (table === "user_devices") {
        return { select: vi.fn().mockReturnValue(userDevicesSelect) };
      }
      if (table === "notification_logs") {
        return { insert: vi.fn().mockResolvedValue({ error: null }) };
      }
      throw new Error(`unexpected table ${table}`);
    }),
  };
}

describe("sendTemplateNotification quiet-hours behavior", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-16T22:30:00"));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ id: "onesignal-msg-id", recipients: 1 }),
      }),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    hoisted.getSupabaseAdminMock.mockReset();
  });

  it("still sends critical transactional template push during quiet hours", async () => {
    hoisted.getSupabaseAdminMock.mockReturnValue(
      createSupabaseMock("provider_booking_request"),
    );

    const { sendTemplateNotification } = await import("@/lib/notifications/onesignal");
    const result = await sendTemplateNotification(
      "provider_booking_request",
      [USER_ID],
      {},
      ["push"],
      { appType: "provider" },
    );

    expect(result.success).toBe(true);
    // Dual-target single-recipient push: one leg to the registered subscription
    // and one alias fan-out leg (shared collapse_id), so push is NOT suppressed
    // by quiet hours for a critical transactional template.
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const bodies = fetchMock.mock.calls.map(
      (c) => JSON.parse(String((c[1] as { body?: string }).body ?? "{}")) as Record<string, unknown>,
    );
    const subLeg = bodies.find((b) => Array.isArray(b.include_subscription_ids));
    const aliasLeg = bodies.find((b) => b.include_aliases);
    expect(subLeg?.include_subscription_ids).toEqual(["sub-1"]);
    expect(aliasLeg?.include_aliases).toEqual({ external_id: [USER_ID] });
    expect(subLeg?.collapse_id).toBeDefined();
    expect(subLeg?.collapse_id).toBe(aliasLeg?.collapse_id);
  });

  it("still sends custom offer template push during quiet hours", async () => {
    hoisted.getSupabaseAdminMock.mockReturnValue(
      createSupabaseMock("customer_custom_offer"),
    );

    const { sendTemplateNotification } = await import("@/lib/notifications/onesignal");
    const result = await sendTemplateNotification(
      "customer_custom_offer",
      [USER_ID],
      {},
      ["push"],
      { appType: "customer" },
    );

    expect(result.success).toBe(true);
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalled();
  });

  it("suppresses marketing template push during quiet hours", async () => {
    hoisted.getSupabaseAdminMock.mockReturnValue(
      createSupabaseMock("promotion_available", {
        quiet_hours_enabled: true,
        quiet_hours_start: "22:00",
        quiet_hours_end: "07:00",
        inspiration_and_offers: { push: true, email: true, sms: true },
      }),
    );

    const { sendTemplateNotification } = await import("@/lib/notifications/onesignal");
    const result = await sendTemplateNotification(
      "promotion_available",
      [USER_ID],
      {},
      ["push"],
      { appType: "customer" },
    );

    expect(result.success).toBe(true);
    expect(result.notification_id).toBe("suppressed-quiet-hours");
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
