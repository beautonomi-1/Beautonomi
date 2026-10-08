import { describe, expect, it, vi, beforeEach } from "vitest";

const mockPaystackInit = vi.fn();
const mockStripeInit = vi.fn();
const mockUpsert = vi.fn();
const mockGetProvider = vi.fn();
const mockFeatureEnabled = vi.fn();

vi.mock("@/lib/payments/paystack-server", () => ({
  initializePaystackTransaction: (...args: unknown[]) => mockPaystackInit(...args),
  initializePaystackTransactionWithPlan: vi.fn(),
}));

vi.mock("@/lib/payments/online-payment-checkouts", () => ({
  upsertOnlinePaymentCheckout: (...args: unknown[]) => mockUpsert(...args),
  getOnlinePaymentCheckoutByReference: vi.fn(),
  markOnlinePaymentCheckoutStatus: vi.fn(),
}));

vi.mock("@/lib/payments/provider/registry", () => ({
  getPaymentProviderForTenant: (...args: unknown[]) => mockGetProvider(...args),
  getPaymentProviderById: vi.fn(),
}));

vi.mock("@/lib/server/feature-flags", () => ({
  isFeatureEnabledServer: (...args: unknown[]) => mockFeatureEnabled(...args),
}));

describe("initializeOnlinePayment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFeatureEnabled.mockResolvedValue(true);
    mockPaystackInit.mockResolvedValue({
      data: {
        reference: "ref_ps",
        authorization_url: "https://checkout.paystack.com/x",
        access_code: "acc",
      },
    });
    mockStripeInit.mockResolvedValue({
      reference: "ref_st",
      authorizationUrl: "https://checkout.stripe.com/c/pay/cs_test",
      checkoutSessionId: "cs_test_1",
    });
    mockUpsert.mockResolvedValue(undefined);
  });

  it("Paystack branch: init transaction and register paystack checkout", async () => {
    mockGetProvider.mockResolvedValue({
      provider: { id: "paystack", initializePayment: mockStripeInit },
      gateway: { config: {} },
    });

    const { initializeOnlinePayment } = await import("../online-payment");
    const out = await initializeOnlinePayment({
      tenantId: "tenant-za",
      email: "a@b.com",
      amountInSmallestUnit: 5000,
      currency: "ZAR",
      reference: "ref_ps",
    });

    expect(out.provider).toBe("paystack");
    expect(mockPaystackInit).toHaveBeenCalled();
    expect(mockStripeInit).not.toHaveBeenCalled();
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "paystack", reference: "ref_ps" }),
    );
    expect(out.authorizationUrl).toContain("paystack");
  });

  it("Stripe branch: uses provider initializePayment and stores checkout session id", async () => {
    mockGetProvider.mockResolvedValue({
      provider: { id: "stripe", initializePayment: mockStripeInit },
      gateway: { config: { settlement_model: "platform_mor_transfer" } },
    });

    const { initializeOnlinePayment } = await import("../online-payment");
    const out = await initializeOnlinePayment({
      tenantId: "tenant-uk",
      email: "a@b.com",
      amountInSmallestUnit: 2500,
      currency: "GBP",
      reference: "ref_st",
      mode: "setup",
      saveCard: true,
    });

    expect(out.provider).toBe("stripe");
    expect(mockPaystackInit).not.toHaveBeenCalled();
    expect(mockStripeInit).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "setup",
        saveCard: true,
        settlementModel: "platform_mor_transfer",
      }),
    );
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "stripe",
        reference: "ref_st",
        checkoutSessionId: "cs_test_1",
      }),
    );
  });

  it("Paystack branch throws when payment_paystack flag is off", async () => {
    mockGetProvider.mockResolvedValue({
      provider: { id: "paystack", initializePayment: mockStripeInit },
      gateway: { config: {} },
    });
    mockFeatureEnabled.mockResolvedValue(false);

    const { initializeOnlinePayment } = await import("../online-payment");
    await expect(
      initializeOnlinePayment({
        tenantId: "tenant-za",
        email: "a@b.com",
        amountInSmallestUnit: 100,
        currency: "ZAR",
        reference: "ref_x",
      }),
    ).rejects.toThrow(/unavailable/i);
  });
});
