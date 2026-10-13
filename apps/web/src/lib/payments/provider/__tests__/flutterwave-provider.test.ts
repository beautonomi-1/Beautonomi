import { describe, expect, it, vi, beforeEach } from "vitest";

const mockFlutterwaveRequest = vi.fn();

vi.mock("@/lib/payments/flutterwave-server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/payments/flutterwave-server")>();
  return {
    ...actual,
    flutterwaveRequest: (...args: unknown[]) => mockFlutterwaveRequest(...args),
    getFlutterwaveSecretKey: vi.fn(async () => "test-secret"),
    getFlutterwaveWebhookHash: vi.fn(async () => "hash"),
    verifyFlutterwaveTransactionById: vi.fn(),
    verifyFlutterwaveWebhookHash: actual.verifyFlutterwaveWebhookHash,
  };
});

describe("flutterwaveProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("initializePayment sends major-unit amount for ZAR", async () => {
    mockFlutterwaveRequest.mockResolvedValue({
      status: "success",
      data: { link: "https://checkout.flutterwave.com/v3/hosted/pay/x", id: 999 },
    });
    const { flutterwaveProvider } = await import("../flutterwave-provider");
    const out = await flutterwaveProvider.initializePayment({
      email: "a@b.com",
      amountInSmallestUnit: 1001,
      currency: "ZAR",
      reference: "ref_fw",
      callbackUrl: "https://example.com/success",
      tenantId: "tenant-1",
    });
    expect(out.authorizationUrl).toContain("flutterwave.com");
    expect(out.paymentIntentId).toBe("999");
    const body = mockFlutterwaveRequest.mock.calls[0][2] as { amount: number };
    expect(body.amount).toBe(10.01);
  });
});
