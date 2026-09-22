import { beforeEach, describe, expect, it, vi } from "vitest";

const USER_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const BOOKING_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

const hoisted = vi.hoisted(() => ({
  fromMock: vi.fn(),
  resolveUsersMock: vi.fn(),
  upsertSessionMock: vi.fn(),
  sendWaMock: vi.fn(),
  resolveCredsMock: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({ from: hoisted.fromMock }),
}));

vi.mock("@/lib/whatsapp/resolve-users-by-phone", () => ({
  resolveUsersByWhatsAppPhone: hoisted.resolveUsersMock,
}));

vi.mock("@/lib/whatsapp/sessions", () => ({
  normalizeWhatsAppPhone: (p: string) => p.replace(/^whatsapp:/, ""),
  upsertWhatsAppInboundSession: hoisted.upsertSessionMock,
  revokeWhatsAppOptInForUserIds: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/integrations/twilio", () => ({
  resolveTwilioCredentials: hoisted.resolveCredsMock,
  sendTwilioWhatsApp: hoisted.sendWaMock,
}));

describe("handleWhatsAppInboundMessage", () => {
  beforeEach(() => {
    hoisted.fromMock.mockReset();
    hoisted.resolveUsersMock.mockReset();
    hoisted.upsertSessionMock.mockReset();
    hoisted.sendWaMock.mockReset();
    hoisted.resolveCredsMock.mockResolvedValue({ whatsappFrom: "whatsapp:+14155238886" });
    hoisted.resolveUsersMock.mockResolvedValue({ users: [{ id: USER_ID }] });
    hoisted.upsertSessionMock.mockResolvedValue(undefined);
  });

  it("records RSVP when confirm button intent matches", async () => {
    const bookingUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });
    const eventsInsert = vi.fn().mockResolvedValue({ error: null });
    const messagesUpsert = vi.fn().mockResolvedValue({ error: null });

    hoisted.fromMock.mockImplementation((table: string) => {
      if (table === "whatsapp_button_intents") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  booking_id: BOOKING_ID,
                  action: "confirm",
                  expires_at: new Date(Date.now() + 3600_000).toISOString(),
                  user_id: USER_ID,
                },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "bookings") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { customer_id: USER_ID, tenant_id: "tenant-1" },
                error: null,
              }),
            }),
          }),
          update: bookingUpdate,
        };
      }
      if (table === "booking_events") {
        return { insert: eventsInsert };
      }
      if (table === "whatsapp_customer_messages") {
        return { upsert: messagesUpsert };
      }
      throw new Error(`unexpected table ${table}`);
    });

    const { handleWhatsAppInboundMessage } = await import("@/lib/whatsapp/inbound-handler");
    await handleWhatsAppInboundMessage({
      messageSid: "SM123",
      from: "whatsapp:+27123456789",
      body: "",
      buttonPayload: "c1",
      buttonText: "Confirm",
    });

    expect(bookingUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ customer_rsvp_at: expect.any(String) }),
    );
    expect(eventsInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        booking_id: BOOKING_ID,
        event_type: "customer_rsvp",
        metadata: { source: "whatsapp" },
      }),
    );
    expect(hoisted.sendWaMock).toHaveBeenCalled();
  });
});
