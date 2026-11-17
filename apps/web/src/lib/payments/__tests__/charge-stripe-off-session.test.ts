import { describe, expect, it, vi, beforeEach } from "vitest";

const mockUpsert = vi.fn();
const mockRetrieve = vi.fn();
const mockCreate = vi.fn();

vi.mock("@/lib/payments/online-payment-checkouts", () => ({
  upsertOnlinePaymentCheckout: (...args: unknown[]) => mockUpsert(...args),
}));

vi.mock("@/lib/payments/stripe-server", () => ({
  getStripeClient: vi.fn(async () => ({
    paymentMethods: { retrieve: mockRetrieve },
    paymentIntents: { create: mockCreate },
  })),
}));

describe("chargeStripeOffSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRetrieve.mockResolvedValue({ customer: "cus_1" });
    mockCreate.mockResolvedValue({ id: "pi_1", status: "succeeded" });
  });

  it("rejects non-Stripe payment method ids", async () => {
    const { chargeStripeOffSession } = await import("../charge-stripe-off-session");
    const result = await chargeStripeOffSession({
      tenantId: "tenant-uk",
      reference: "ref-1",
      email: "a@b.com",
      amountInSmallestUnit: 1000,
      currency: "GBP",
      stripePaymentMethodId: "AUTH_bad",
      metadata: {},
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("Invalid Stripe");
  });

  it("charges a saved pm_* and registers checkout", async () => {
    const { chargeStripeOffSession } = await import("../charge-stripe-off-session");
    const result = await chargeStripeOffSession({
      tenantId: "tenant-uk",
      reference: "ref-gbp",
      email: "a@b.com",
      amountInSmallestUnit: 2500,
      currency: "GBP",
      stripePaymentMethodId: "pm_card",
      metadata: { booking_id: "b1" },
    });
    expect(result.ok).toBe(true);
    expect(mockUpsert).toHaveBeenCalled();
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        currency: "gbp",
        payment_method: "pm_card",
        off_session: true,
      }),
      expect.any(Object),
    );
  });

  it("leaves a processing charge open and fails a declined card", async () => {
    const { chargeStripeOffSession } = await import("../charge-stripe-off-session");
    mockCreate.mockResolvedValueOnce({ id: "pi_open", status: "processing" });
    const pending = await chargeStripeOffSession({
      tenantId: "tenant-uk",
      reference: "ref-open",
      email: "a@b.com",
      amountInSmallestUnit: 2500,
      currency: "GBP",
      stripePaymentMethodId: "pm_card",
      metadata: { booking_id: "b1" },
    });
    expect(pending.ok).toBe(false);
    if (!pending.ok) expect(pending.pending).toBe(true);

    mockCreate.mockResolvedValueOnce({ id: "pi_declined", status: "requires_payment_method" });
    const declined = await chargeStripeOffSession({
      tenantId: "tenant-uk",
      reference: "ref-declined",
      email: "a@b.com",
      amountInSmallestUnit: 2500,
      currency: "GBP",
      stripePaymentMethodId: "pm_card",
      metadata: { booking_id: "b1" },
    });
    expect(declined.ok).toBe(false);
    if (!declined.ok) expect(declined.pending).toBeUndefined();

    mockCreate.mockRejectedValueOnce(
      Object.assign(new Error("Authentication required"), {
        code: "authentication_required",
        payment_intent: { id: "pi_auth", status: "requires_action" },
      }),
    );
    const auth = await chargeStripeOffSession({
      tenantId: "tenant-uk",
      reference: "ref-auth",
      email: "a@b.com",
      amountInSmallestUnit: 2500,
      currency: "GBP",
      stripePaymentMethodId: "pm_card",
      metadata: { booking_id: "b1" },
    });
    expect(auth.ok).toBe(false);
    if (!auth.ok) expect(auth.pending).toBe(true);
  });
});
