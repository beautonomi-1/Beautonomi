/**
 * Per-user email/SMS gating for template sends (Option A follow-up).
 *
 * When one template fans out to several recipients with *different* email/SMS
 * preferences, each recipient must be gated individually — a single opt-out
 * must not suppress the channel for everyone. Email/SMS are delivered through
 * the durable Resend/Twilio queue, so we assert on the enqueued rows.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const USER_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"; // email on
const USER_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"; // email off (global)
const BOOKING_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc";

const hoisted = vi.hoisted(() => ({
  getSupabaseAdminMock: vi.fn(),
  enqueueNotificationMock: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: hoisted.getSupabaseAdminMock,
}));

vi.mock("@/lib/notifications/enqueue", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/notifications/enqueue")>();
  return { ...actual, enqueueNotification: hoisted.enqueueNotificationMock };
});

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

function createSupabaseMock(opts: {
  templateChannels: string[];
  users: Array<{
    id: string;
    email_notifications_enabled?: boolean;
    sms_notifications_enabled?: boolean;
    push_notifications_enabled?: boolean;
  }>;
  profiles: Array<{ user_id: string; notification_preferences: unknown }>;
}) {
  const templateRow = {
    key: "booking_confirmed",
    title: "Booking confirmed",
    body: "Your booking is confirmed",
    email_subject: "Booking confirmed",
    email_body: "<p>Your booking is confirmed</p>",
    sms_body: "Booking confirmed",
    channels: opts.templateChannels,
    enabled: true,
  };
  const templateQuery = {
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: templateRow, error: null }),
  };

  const deviceResult = Promise.resolve({ data: [], error: null });
  const userDevicesQuery = {
    eq: vi.fn().mockReturnValue(deviceResult),
    or: vi.fn().mockReturnValue(deviceResult),
    then: deviceResult.then.bind(deviceResult),
    catch: deviceResult.catch.bind(deviceResult),
  };

  return {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === "notification_templates") {
        return { select: vi.fn().mockReturnValue(templateQuery) };
      }
      if (table === "users") {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: opts.users, error: null }),
          }),
        };
      }
      if (table === "user_profiles") {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: opts.profiles, error: null }),
          }),
        };
      }
      if (table === "user_devices") {
        return { select: vi.fn().mockReturnValue({ in: vi.fn().mockReturnValue(userDevicesQuery) }) };
      }
      if (table === "notification_logs") {
        return { insert: vi.fn().mockResolvedValue({ error: null }) };
      }
      throw new Error(`unexpected table ${table}`);
    }),
  };
}

describe("sendTemplateNotification per-user email/SMS gating", () => {
  beforeEach(() => {
    hoisted.enqueueNotificationMock.mockResolvedValue({ id: "q1", inserted: true });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ id: "msg", recipients: 1 }),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    hoisted.getSupabaseAdminMock.mockReset();
    hoisted.enqueueNotificationMock.mockReset();
    vi.resetModules();
  });

  it("enqueues email only for the recipient who allows it (mixed prefs)", async () => {
    hoisted.getSupabaseAdminMock.mockReturnValue(
      createSupabaseMock({
        templateChannels: ["email"],
        users: [
          { id: USER_A, email_notifications_enabled: true },
          { id: USER_B, email_notifications_enabled: false }, // global email off
        ],
        profiles: [
          { user_id: USER_A, notification_preferences: null },
          { user_id: USER_B, notification_preferences: null },
        ],
      }),
    );

    const { sendTemplateNotification } = await import("@/lib/notifications/onesignal");
    const result = await sendTemplateNotification(
      "booking_confirmed",
      [USER_A, USER_B],
      { booking_id: BOOKING_ID },
      ["email"],
      { appType: "customer" },
    );

    expect(result.success).toBe(true);

    const emailCalls = hoisted.enqueueNotificationMock.mock.calls.filter(
      (c) => (c[0] as { channel: string }).channel === "email",
    );
    const recipients = emailCalls.map((c) => (c[0] as { recipientUserId: string }).recipientUserId);
    expect(recipients).toEqual([USER_A]); // USER_B suppressed, USER_A still delivered
    expect(emailCalls[0][0]).toMatchObject({
      channel: "email",
      templateKey: "booking_confirmed",
      bookingId: BOOKING_ID,
      dedupeKey: `template:booking_confirmed:${USER_A}:email:${BOOKING_ID}`,
    });
  });

  it("does not call OneSignal for email-only sends (queue handles it)", async () => {
    hoisted.getSupabaseAdminMock.mockReturnValue(
      createSupabaseMock({
        templateChannels: ["email"],
        users: [{ id: USER_A, email_notifications_enabled: true }],
        profiles: [{ user_id: USER_A, notification_preferences: null }],
      }),
    );

    const { sendTemplateNotification } = await import("@/lib/notifications/onesignal");
    await sendTemplateNotification(
      "booking_confirmed",
      [USER_A],
      { booking_id: BOOKING_ID },
      ["email"],
      { appType: "customer" },
    );

    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(hoisted.enqueueNotificationMock).toHaveBeenCalledTimes(1);
  });
});
