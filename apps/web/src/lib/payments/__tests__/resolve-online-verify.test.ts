import { describe, expect, it, vi, beforeEach } from "vitest";

const mockGetCheckout = vi.fn();
const mockRetrieveSession = vi.fn();
const mockSettleSession = vi.fn();
const mockVerifyOnline = vi.fn();
const mockPaystackKey = vi.fn();

vi.mock("@/lib/payments/online-payment-checkouts", () => ({
  getOnlinePaymentCheckoutByReference: (...args: unknown[]) => mockGetCheckout(...args),
}));

vi.mock("@/lib/payments/stripe-server", () => ({
  getStripeClient: vi.fn(async () => ({
    checkout: { sessions: { retrieve: mockRetrieveSession } },
  })),
}));

vi.mock("@/lib/payments/settle-stripe-online-payment", () => ({
  settleStripeCheckoutSession: (...args: unknown[]) => mockSettleSession(...args),
  settleStripePaymentIntentSucceeded: vi.fn(),
}));

vi.mock("@/lib/payments/online-payment", () => ({
  verifyOnlinePayment: (...args: unknown[]) => mockVerifyOnline(...args),
}));

vi.mock("@/lib/payments/paystack-server", () => ({
  getPaystackSecretKey: (...args: unknown[]) => mockPaystackKey(...args),
}));

describe("verifyAndSettleOnlinePayment", () => {
  const supabase = {} as import("@supabase/supabase-js").SupabaseClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCheckout.mockResolvedValue(null);
    mockRetrieveSession.mockResolvedValue({
      id: "cs_live",
      mode: "payment",
      status: "complete",
      payment_status: "paid",
    });
    mockSettleSession.mockResolvedValue(undefined);
    global.fetch = vi.fn();
  });

  it("settles via session_id when checkout row is missing and session reference matches", async () => {
    mockRetrieveSession.mockResolvedValue({
      id: "cs_live",
      mode: "payment",
      status: "complete",
      payment_status: "paid",
      client_reference_id: "ref_orphan",
    });
    const { verifyAndSettleOnlinePayment } = await import("../resolve-online-verify");
    const result = await verifyAndSettleOnlinePayment(
      { reference: "ref_orphan", tenantId: "tenant-uk", sessionId: "cs_live" },
      supabase,
    );

    expect(result.paid).toBe(true);
    expect(result.provider).toBe("stripe");
    expect(mockRetrieveSession).toHaveBeenCalledWith("cs_live", expect.any(Object));
    expect(mockSettleSession).toHaveBeenCalled();
  });

  it("does not settle when session_id reference does not match query reference", async () => {
    mockRetrieveSession.mockResolvedValue({
      id: "cs_live",
      mode: "payment",
      status: "complete",
      payment_status: "paid",
      client_reference_id: "other_ref",
    });
    const { verifyAndSettleOnlinePayment } = await import("../resolve-online-verify");
    const result = await verifyAndSettleOnlinePayment(
      { reference: "ref_orphan", tenantId: "tenant-uk", sessionId: "cs_live" },
      supabase,
    );

    expect(result.paid).toBe(false);
    expect(mockSettleSession).not.toHaveBeenCalled();
  });

  it("uses Paystack verify when checkout is paystack even if session_id is present", async () => {
    mockGetCheckout.mockResolvedValue({ provider: "paystack", tenant_id: "tenant-za" });
    mockPaystackKey.mockResolvedValue("sk_test");
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ data: { status: "success" } }),
    });
    const { verifyAndSettleOnlinePayment } = await import("../resolve-online-verify");
    const result = await verifyAndSettleOnlinePayment(
      { reference: "ps_ref", tenantId: "tenant-za", sessionId: "cs_accidental" },
      supabase,
    );

    expect(result.paid).toBe(true);
    expect(result.provider).toBe("paystack");
    expect(mockRetrieveSession).not.toHaveBeenCalled();
  });
});
