import { describe, expect, it, vi, beforeEach } from "vitest";

const openFraudCaseMock = vi.fn();

vi.mock("@/lib/fraud/open-fraud-case", () => ({
  openFraudCase: (...args: unknown[]) => openFraudCaseMock(...args),
}));

vi.mock("@/lib/fraud/resolve-payment-fraud-subjects", () => ({
  resolvePaymentFraudSubjects: vi.fn().mockResolvedValue({
    tenantId: "tenant-1",
    subjectUserId: "user-1",
    subjectProviderId: "provider-1",
    bookingId: "booking-1",
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn().mockReturnValue({ from: vi.fn() }),
}));

describe("handleStripeChargeDisputeCreated", () => {
  beforeEach(() => {
    openFraudCaseMock.mockResolvedValue({ fraudCaseId: "fc-1", created: true, alreadyExisted: false });
    vi.clearAllMocks();
  });

  it("opens fraud case with stripe idempotency key", async () => {
    const { handleStripeChargeDisputeCreated } = await import(
      "@/app/api/payments/stripe/webhook/_handlers/stripe-dispute"
    );

    await handleStripeChargeDisputeCreated(
      {
        id: "dp_test123",
        payment_intent: "pi_test",
        amount: 5000,
        currency: "zar",
        reason: "fraudulent",
      },
      "evt_123",
    );

    expect(openFraudCaseMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        paymentProvider: "stripe",
        paymentReference: "pi_test",
        signal: "psp.chargeback",
        idempotencyKey: "stripe:dispute:dp_test123",
      }),
      expect.anything(),
    );
  });

  it("no-ops when dispute id missing", async () => {
    const { handleStripeChargeDisputeCreated } = await import(
      "@/app/api/payments/stripe/webhook/_handlers/stripe-dispute"
    );

    await handleStripeChargeDisputeCreated({}, "evt_123");
    expect(openFraudCaseMock).not.toHaveBeenCalled();
  });
});
