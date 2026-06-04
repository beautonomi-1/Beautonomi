import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const USER_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const BOOKING_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

const hoisted = vi.hoisted(() => ({
  getSupabaseAdminMock: vi.fn(),
  enqueueNotificationMock: vi.fn(),
  sendToUserMock: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: hoisted.getSupabaseAdminMock,
}));

vi.mock("@/lib/notifications/enqueue", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/notifications/enqueue")>();
  return {
    ...actual,
    enqueueNotification: hoisted.enqueueNotificationMock,
  };
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

function createSupabaseForTemplateSend() {
  const templateRow = {
    key: "booking_confirmed",
    title: "Booking confirmed",
    body: "Your booking is confirmed",
    channels: ["push"],
    enabled: true,
  };

  const templateQuery = {
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: templateRow, error: null }),
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

  return {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === "notification_templates") {
        return { select: vi.fn().mockReturnValue(templateQuery) };
      }
      if (table === "user_devices") {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue(userDevicesQuery),
          }),
        };
      }
      if (table === "notification_logs") {
        return { insert: vi.fn().mockResolvedValue({ error: null }) };
      }
      throw new Error(`unexpected table ${table}`);
    }),
  };
}

describe("notification retry integration", () => {
  beforeEach(() => {
    hoisted.enqueueNotificationMock.mockResolvedValue({ id: "queue-1", inserted: true });
    hoisted.sendToUserMock.mockReset();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => JSON.stringify({ errors: ["OneSignal down"] }),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    hoisted.getSupabaseAdminMock.mockReset();
    hoisted.enqueueNotificationMock.mockReset();
    vi.resetModules();
  });

  it("sendTemplateNotification enqueues durable push retry when OneSignal fails", async () => {
    hoisted.getSupabaseAdminMock.mockReturnValue(createSupabaseForTemplateSend());

    const { sendTemplateNotification } = await import("@/lib/notifications/onesignal");
    const result = await sendTemplateNotification(
      "booking_confirmed",
      [USER_ID],
      { booking_id: BOOKING_ID },
      ["push"],
      { appType: "provider" },
    );

    expect(result.success).toBe(false);
    expect(hoisted.enqueueNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "push",
        templateKey: "booking_confirmed",
        recipientUserId: USER_ID,
        bookingId: BOOKING_ID,
        dedupeKey: `fallback:booking_confirmed:${USER_ID}:push:${BOOKING_ID}`,
        pushAppType: "provider",
      }),
    );
  });

  it("sendTemplateNotification does not enqueue retry for marketing templates", async () => {
    hoisted.getSupabaseAdminMock.mockReturnValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "notification_templates") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnThis(),
              is: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  key: "promotion_available",
                  title: "Promo",
                  body: "Sale",
                  channels: ["push"],
                  enabled: true,
                },
                error: null,
              }),
            }),
          };
        }
        if (table === "user_devices") {
          const deviceResult = Promise.resolve({
            data: [{ onesignal_player_id: "sub-1" }],
            error: null,
          });
          const q = {
            eq: vi.fn().mockReturnValue(deviceResult),
            or: vi.fn().mockReturnValue(deviceResult),
            then: deviceResult.then.bind(deviceResult),
            catch: deviceResult.catch.bind(deviceResult),
          };
          return { select: vi.fn().mockReturnValue({ in: vi.fn().mockReturnValue(q) }) };
        }
        if (table === "user_profiles") {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          };
        }
        if (table === "users") {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          };
        }
        if (table === "notification_logs") {
          return { insert: vi.fn().mockResolvedValue({ error: null }) };
        }
        throw new Error(`unexpected table ${table}`);
      }),
    });

    const { sendTemplateNotification } = await import("@/lib/notifications/onesignal");
    await sendTemplateNotification(
      "promotion_available",
      [USER_ID],
      {},
      ["push"],
      { appType: "customer" },
    );

    expect(hoisted.enqueueNotificationMock).not.toHaveBeenCalled();
  });

  it("sendToUser enqueues durable retry on push failure for must-deliver types", async () => {
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
    hoisted.getSupabaseAdminMock.mockReturnValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "user_devices") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue(userDevicesQuery),
            }),
          };
        }
        if (table === "notification_logs") {
          return { insert: vi.fn().mockResolvedValue({ error: null }) };
        }
        throw new Error(`unexpected table ${table}`);
      }),
    });

    const { sendToUser } = await import("@/lib/notifications/onesignal");
    await sendToUser(
      USER_ID,
      {
        title: "Custom offer received",
        message: "You have an offer",
        data: { type: "custom_offer", offer_id: "offer-1" },
      },
      ["push"],
      { appType: "customer" },
    );

    expect(hoisted.enqueueNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "push",
        templateKey: "custom_offer",
        recipientUserId: USER_ID,
        dedupeKey: `fallback:custom_offer:${USER_ID}:push:none`,
      }),
    );
  });
});

describe("process-notification-queue cron integration", () => {
  const QUEUE_ROW_ID = "queue-row-uuid";

  beforeEach(() => {
    process.env.CRON_SECRET = "test-cron-secret";
    vi.resetModules();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("marks row failed (not delivered) when queue worker push send fails", async () => {
    const statusUpdates: Array<Record<string, unknown>> = [];

    vi.doMock("@/lib/cron-auth", () => ({
      verifyCronRequest: vi.fn().mockReturnValue({ valid: true }),
    }));

    vi.doMock("@/lib/notifications/onesignal", () => ({
      sendToUser: vi.fn().mockResolvedValue({ success: false, error: "OneSignal 500" }),
    }));

    vi.doMock("@/lib/supabase/admin", () => ({
      getSupabaseAdmin: vi.fn().mockReturnValue({
        from: vi.fn().mockImplementation((table: string) => {
          if (table !== "notification_delivery_queue") {
            throw new Error(`unexpected table ${table}`);
          }
          return {
            update: vi.fn().mockImplementation((payload: Record<string, unknown>) => {
              statusUpdates.push(payload);
              const chain = {
                eq: vi.fn().mockReturnThis(),
                in: vi.fn().mockReturnThis(),
                lt: vi.fn().mockResolvedValue({ error: null }),
                lte: vi.fn().mockReturnThis(),
                order: vi.fn().mockReturnThis(),
                limit: vi.fn().mockReturnThis(),
                select: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: { id: QUEUE_ROW_ID } }),
                }),
              };
              return chain;
            }),
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                lte: vi.fn().mockReturnValue({
                  order: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue({
                      data: [
                        {
                          id: QUEUE_ROW_ID,
                          channel: "push",
                          template_key: "booking_confirmed",
                          payload: {
                            title: "T",
                            message: "M",
                            data: { template_key: "booking_confirmed" },
                          },
                          attempts: 0,
                          max_attempts: 5,
                          recipient_user_id: USER_ID,
                          booking_id: null,
                          notification_id: null,
                        },
                      ],
                      error: null,
                    }),
                  }),
                }),
              }),
              eq: vi.fn().mockReturnValue({
                select: vi.fn().mockResolvedValue({ count: 0 }),
              }),
            }),
          };
        }),
      }),
    }));

    vi.doMock("@sentry/nextjs", () => ({
      captureMessage: vi.fn(),
      captureException: vi.fn(),
    }));

    const { GET } = await import(
      "@/app/api/cron/process-notification-queue/route"
    );
    const { NextRequest } = await import("next/server");
    const res = await GET(
      new NextRequest("http://localhost/api/cron/process-notification-queue", {
        headers: { authorization: "Bearer test-cron-secret" },
      }),
    );
    const body = (await res.json()) as { delivered: number; failed: number };

    expect(body.delivered).toBe(0);
    expect(body.failed).toBe(1);
    expect(statusUpdates.some((u) => u.status === "failed")).toBe(true);
    expect(statusUpdates.some((u) => u.status === "delivered")).toBe(false);
  });
});
