import { describe, expect, it, vi, beforeEach } from "vitest";

const mockProcessSuccessfulPayment = vi.fn();
const mockRetrieve = vi.fn();

vi.mock("@/app/api/payments/webhook/_handlers/charge-success", () => ({
  processSuccessfulPayment: (...args: unknown[]) => mockProcessSuccessfulPayment(...args),
}));

vi.mock("@/lib/payments/stripe-server", () => ({
  getStripeClient: vi.fn(async () => ({
    checkout: { sessions: { retrieve: mockRetrieve } },
  })),
}));

describe("settleStripeCheckoutSession (setup mode)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRetrieve.mockResolvedValue({
      id: "cs_setup",
      mode: "setup",
      status: "complete",
      client_reference_id: "card_verify_1",
      currency: "gbp",
      customer: "cus_1",
      customer_details: { email: "user@test.com" },
      metadata: {
        kind: "card_verification",
        customer_id: "user-1",
        save_card: "true",
        tenant_id: "tenant-uk",
      },
      setup_intent: {
        payment_method: {
          id: "pm_saved",
          card: { last4: "4242", exp_month: 12, exp_year: 2030, brand: "visa" },
        },
      },
    });
  });

  it("settles completed setup sessions and saves card metadata", async () => {
    const { settleStripeCheckoutSession } = await import("../settle-stripe-online-payment");
    await settleStripeCheckoutSession(
      {
        id: "cs_setup",
        mode: "setup",
        status: "complete",
        client_reference_id: "card_verify_1",
        metadata: {
          kind: "card_verification",
          customer_id: "user-1",
          tenant_id: "tenant-uk",
        },
        setup_intent: "seti_xxx",
      },
      {} as never,
    );

    expect(mockRetrieve).toHaveBeenCalled();
    expect(mockProcessSuccessfulPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        reference: "card_verify_1",
        metadata: expect.objectContaining({
          stripe_payment_method_id: "pm_saved",
          stripe_card_last4: "4242",
        }),
        __paymentProvider: "stripe",
      }),
      expect.anything(),
      expect.objectContaining({ paymentProvider: "stripe" }),
    );
  });
});
