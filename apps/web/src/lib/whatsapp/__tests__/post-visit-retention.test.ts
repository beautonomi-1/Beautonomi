import { beforeEach, describe, expect, it, vi } from "vitest";

const BOOKING_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const CUSTOMER_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc";

const hoisted = vi.hoisted(() => ({
  journeyEnabled: vi.fn(),
  dispatchMock: vi.fn(),
  fromMock: vi.fn(),
}));

vi.mock("@/lib/whatsapp/journey-flags", () => ({
  isCustomerWhatsAppJourneyEnabled: hoisted.journeyEnabled,
}));

vi.mock("@/lib/notifications/dispatch-template-notification", () => ({
  dispatchTemplateNotification: hoisted.dispatchMock,
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({ from: hoisted.fromMock }),
}));

function buildRetentionSendsMock(insertMock: ReturnType<typeof vi.fn>) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.gte = vi.fn().mockResolvedValue({ count: 0, error: null });
  chain.limit = vi.fn().mockResolvedValue({ data: [], error: null });
  chain.insert = insertMock;
  return chain;
}

function bookingChain(booking: Record<string, unknown> | null) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({ data: booking, error: null }),
      }),
    }),
  };
}

function userChain(user: Record<string, unknown> | null) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({ data: user, error: null }),
      }),
    }),
  };
}

describe("maybeEnqueuePostVisitWhatsApp", () => {
  beforeEach(() => {
    hoisted.journeyEnabled.mockReset();
    hoisted.dispatchMock.mockReset();
    hoisted.fromMock.mockReset();
    process.env.NEXT_PUBLIC_APP_URL = "https://app.test";
    hoisted.dispatchMock.mockResolvedValue({ success: true });
  });

  it("returns false when journey flag is off", async () => {
    hoisted.journeyEnabled.mockResolvedValue(false);
    hoisted.fromMock.mockImplementation((table: string) => {
      if (table === "bookings") {
        return bookingChain({
          id: BOOKING_ID,
          customer_id: CUSTOMER_ID,
          tenant_id: "tenant-1",
          booking_number: "BN1",
          loyalty_points_earned: 10,
          providers: { business_name: "Salon A" },
        });
      }
      throw new Error(`unexpected ${table}`);
    });

    const { maybeEnqueuePostVisitWhatsApp } = await import("@/lib/whatsapp/post-visit-retention");
    await expect(maybeEnqueuePostVisitWhatsApp(BOOKING_ID)).resolves.toBe(false);
    expect(hoisted.dispatchMock).not.toHaveBeenCalled();
  });

  it("enqueues post_visit_whatsapp and records retention send on success", async () => {
    hoisted.journeyEnabled.mockResolvedValue(true);
    const insertMock = vi.fn().mockResolvedValue({ error: null });

    hoisted.fromMock.mockImplementation((table: string) => {
      if (table === "bookings") {
        return bookingChain({
          id: BOOKING_ID,
          customer_id: CUSTOMER_ID,
          tenant_id: "tenant-1",
          booking_number: "BN1",
          loyalty_points_earned: 25,
          providers: { business_name: "Salon A" },
        });
      }
      if (table === "whatsapp_retention_sends") {
        return buildRetentionSendsMock(insertMock);
      }
      if (table === "users") {
        return userChain({
          email: "guest@test.com",
          is_shadow: true,
          claimed_at: null,
          whatsapp_opted_out_at: null,
          phone: "+27123456789",
        });
      }
      throw new Error(`unexpected ${table}`);
    });

    const { maybeEnqueuePostVisitWhatsApp } = await import("@/lib/whatsapp/post-visit-retention");
    await expect(maybeEnqueuePostVisitWhatsApp(BOOKING_ID)).resolves.toBe(true);

    expect(hoisted.dispatchMock).toHaveBeenCalledWith(
      "post_visit_whatsapp",
      [CUSTOMER_ID],
      expect.objectContaining({
        provider_name: "Salon A",
        booking_number: "BN1",
        loyalty_points: "25",
        review_url: `https://app.test/account-settings/bookings/${BOOKING_ID}`,
        claim_link: `https://app.test/auth/claim?booking=${BOOKING_ID}`,
      }),
      ["whatsapp"],
      expect.objectContaining({ appType: "customer", tenantId: "tenant-1" }),
    );
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: CUSTOMER_ID,
        kind: "post_visit",
        booking_id: BOOKING_ID,
      }),
    );
  });

  it("skips when customer opted out of WhatsApp", async () => {
    hoisted.journeyEnabled.mockResolvedValue(true);
    hoisted.fromMock.mockImplementation((table: string) => {
      if (table === "bookings") {
        return bookingChain({
          id: BOOKING_ID,
          customer_id: CUSTOMER_ID,
          tenant_id: "tenant-1",
          booking_number: "BN1",
          loyalty_points_earned: 0,
          providers: { business_name: "Salon A" },
        });
      }
      if (table === "whatsapp_retention_sends") {
        return buildRetentionSendsMock(vi.fn());
      }
      if (table === "users") {
        return userChain({
          email: "a@test.com",
          whatsapp_opted_out_at: new Date().toISOString(),
          phone: "+27123456789",
        });
      }
      throw new Error(`unexpected ${table}`);
    });

    const { maybeEnqueuePostVisitWhatsApp } = await import("@/lib/whatsapp/post-visit-retention");
    await expect(maybeEnqueuePostVisitWhatsApp(BOOKING_ID)).resolves.toBe(false);
    expect(hoisted.dispatchMock).not.toHaveBeenCalled();
  });
});
