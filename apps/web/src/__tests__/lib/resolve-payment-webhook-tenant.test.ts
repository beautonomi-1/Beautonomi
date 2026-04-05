import { describe, it, expect, vi } from "vitest";
import {
  extractBookingIdFromPaystackPayloadData,
  resolvePaymentWebhookTenantId,
} from "@/lib/payment/resolve-payment-webhook-tenant";

describe("extractBookingIdFromPaystackPayloadData", () => {
  it("returns trimmed booking_id when present", () => {
    expect(
      extractBookingIdFromPaystackPayloadData({
        metadata: { booking_id: "  b1  " },
      }),
    ).toBe("b1");
  });

  it("returns null when missing or not a string", () => {
    expect(extractBookingIdFromPaystackPayloadData({})).toBeNull();
    expect(extractBookingIdFromPaystackPayloadData({ metadata: { booking_id: 1 } })).toBeNull();
    expect(extractBookingIdFromPaystackPayloadData({ metadata: { booking_id: "" } })).toBeNull();
    expect(extractBookingIdFromPaystackPayloadData({ metadata: { booking_id: "   " } })).toBeNull();
    expect(extractBookingIdFromPaystackPayloadData(null)).toBeNull();
  });

  it("returns null when metadata is absent on non-object payloads", () => {
    expect(extractBookingIdFromPaystackPayloadData("string")).toBeNull();
    expect(extractBookingIdFromPaystackPayloadData(42)).toBeNull();
  });

  it("reads booking_id from nested metadata.custom_fields object", () => {
    expect(
      extractBookingIdFromPaystackPayloadData({
        metadata: { custom_fields: { booking_id: "  cf-booking  " } },
      }),
    ).toBe("cf-booking");
  });

  it("reads booking_id from Paystack-style custom_fields array", () => {
    expect(
      extractBookingIdFromPaystackPayloadData({
        metadata: {
          custom_fields: [
            { variable_name: "other", value: "x" },
            { variable_name: "booking_id", value: "  arr-bid  " },
          ],
        },
      }),
    ).toBe("arr-bid");
  });

  it("prefers top-level metadata.booking_id over custom_fields", () => {
    expect(
      extractBookingIdFromPaystackPayloadData({
        metadata: {
          booking_id: "top",
          custom_fields: { booking_id: "nested" },
        },
      }),
    ).toBe("top");
  });

  it("returns null for subscription-only metadata (no booking_id)", () => {
    expect(
      extractBookingIdFromPaystackPayloadData({
        metadata: {
          provider_subscription_order_id: "sub-1",
          kind: "subscription_authorization",
        },
      }),
    ).toBeNull();
  });
});

describe("resolvePaymentWebhookTenantId", () => {
  it("prefers host tenant when set", async () => {
    const supabase = { from: vi.fn() };
    const id = await resolvePaymentWebhookTenantId(supabase as never, {
      hostTenantId: "host-tenant",
      bookingIdFromPayload: "b1",
      defaultTenantId: "za-id",
    });
    expect(id).toBe("host-tenant");
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("loads booking tenant when host is empty", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { tenant_id: "from-booking" },
      error: null,
    });
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle,
      }),
    };

    const id = await resolvePaymentWebhookTenantId(supabase as never, {
      hostTenantId: null,
      bookingIdFromPayload: "b1",
      defaultTenantId: "za-id",
    });
    expect(id).toBe("from-booking");
  });

  it("falls back to default tenant id", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle,
      }),
    };

    const id = await resolvePaymentWebhookTenantId(supabase as never, {
      hostTenantId: null,
      bookingIdFromPayload: null,
      defaultTenantId: "za-uuid",
    });
    expect(id).toBe("za-uuid");
  });

  it("treats whitespace-only host as absent and uses booking tenant", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { tenant_id: "booking-tenant" },
      error: null,
    });
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle,
      }),
    };

    const id = await resolvePaymentWebhookTenantId(supabase as never, {
      hostTenantId: "   ",
      bookingIdFromPayload: "b1",
      defaultTenantId: "za-id",
    });
    expect(id).toBe("booking-tenant");
    expect(supabase.from).toHaveBeenCalledWith("bookings");
  });

  it("falls back when booking exists but tenant_id is null or blank", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { tenant_id: null },
      error: null,
    });
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle,
      }),
    };

    const id = await resolvePaymentWebhookTenantId(supabase as never, {
      hostTenantId: null,
      bookingIdFromPayload: "b1",
      defaultTenantId: "fallback-tenant",
    });
    expect(id).toBe("fallback-tenant");
  });

  it("returns null when nothing resolves (no host, no booking tenant, no default)", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle,
      }),
    };

    const id = await resolvePaymentWebhookTenantId(supabase as never, {
      hostTenantId: null,
      bookingIdFromPayload: "missing-booking",
      defaultTenantId: null,
    });
    expect(id).toBeNull();
  });

  it("subscription-style payload without booking_id uses default only", async () => {
    const supabase = { from: vi.fn() };
    const id = await resolvePaymentWebhookTenantId(supabase as never, {
      hostTenantId: null,
      bookingIdFromPayload: null,
      defaultTenantId: "za-default",
    });
    expect(id).toBe("za-default");
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("trims booking id before loading tenant from bookings", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { tenant_id: "t-tenant" },
      error: null,
    });
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle,
      }),
    };

    const id = await resolvePaymentWebhookTenantId(supabase as never, {
      hostTenantId: null,
      bookingIdFromPayload: "  bid-1  ",
      defaultTenantId: "za-id",
    });
    expect(id).toBe("t-tenant");
    expect(supabase.from).toHaveBeenCalledWith("bookings");
    expect(maybeSingle).toHaveBeenCalled();
  });

  it("falls back when Supabase returns an error on booking lookup", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "timeout" },
    });
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle,
      }),
    };

    const id = await resolvePaymentWebhookTenantId(supabase as never, {
      hostTenantId: null,
      bookingIdFromPayload: "b1",
      defaultTenantId: "fallback",
    });
    expect(id).toBe("fallback");
  });
});
