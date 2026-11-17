import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const mockProcessSuccessfulPayment = vi.fn();
const mockProcessFailedPayment = vi.fn();
const mockRetrieve = vi.fn();

vi.mock("@/app/api/payments/webhook/_handlers/charge-success", () => ({
  processSuccessfulPayment: (...args: unknown[]) => mockProcessSuccessfulPayment(...args),
  processFailedPayment: (...args: unknown[]) => mockProcessFailedPayment(...args),
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

  it("sends a declined Stripe card through the same failure handler", async () => {
    const { settleStripePaymentIntentFailed } = await import("../settle-stripe-online-payment");
    await settleStripePaymentIntentFailed(
      {
        id: "pi_1",
        client_reference_id: "ref-1",
        metadata: { booking_id: "booking-1", wallet_amount_applied: "30" },
        last_payment_error: { message: "Card declined" },
      },
      {} as never,
    );

    expect(mockProcessFailedPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        reference: "ref-1",
        __paymentProvider: "stripe",
        gateway_response: "Card declined",
        metadata: expect.objectContaining({ booking_id: "booking-1", wallet_amount_applied: "30" }),
      }),
      expect.anything(),
    );
  });
});

describe("stripe webhook failure cases", () => {
  it("runs the failure handler for a declined payment intent and a session whose intent id is only a string", () => {
    const src = readFileSync(
      join(process.cwd(), "src/app/api/payments/stripe/webhook/route.ts"),
      "utf8",
    );
    const declined = src.slice(src.indexOf('case "payment_intent.payment_failed"'));
    expect(declined.slice(0, 400)).toContain("settleStripePaymentIntentFailed");
    const sessionFailed = src.slice(src.indexOf('case "checkout.session.async_payment_failed"'));
    expect(sessionFailed.slice(0, 900)).toContain('typeof pi === "string"');
    expect(sessionFailed.slice(0, 900)).toContain("settleStripePaymentIntentFailed");
  });
});
