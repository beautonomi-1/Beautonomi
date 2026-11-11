import { describe, expect, it, vi, beforeEach } from "vitest";
import { verifyFlutterwaveWebhookSignature } from "@/lib/payments/flutterwave-webhook-verify";

vi.mock("@/lib/payments/flutterwave-server", () => ({
  getFlutterwaveWebhookHash: vi.fn(async (opts?: { tenantId?: string | null }) => {
    if (opts?.tenantId === "tenant-a") return "secret-a";
    if (opts?.tenantId === "tenant-b") return "secret-b";
    return "secret-env";
  }),
  verifyFlutterwaveWebhookHash: vi.fn((header: string, secret: string) => header === secret),
}));

vi.mock("@/lib/payments/online-payment-checkouts", () => ({
  getOnlinePaymentCheckoutByReference: vi.fn(async (ref: string) =>
    ref === "checkout-ref-1" ? { tenant_id: "tenant-b" } : null,
  ),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn(),
}));

describe("verifyFlutterwaveWebhookSignature", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("accepts signature matching tenant from checkout tx_ref", async () => {
    const body = JSON.stringify({
      event: "charge.completed",
      data: { tx_ref: "checkout-ref-1", status: "successful" },
    });
    const ok = await verifyFlutterwaveWebhookSignature(body, "secret-b");
    expect(ok).toBe(true);
  });

  it("accepts signature matching env secret", async () => {
    const body = JSON.stringify({ event: "transfer.completed", data: { reference: "payout_x" } });
    const ok = await verifyFlutterwaveWebhookSignature(body, "secret-env");
    expect(ok).toBe(true);
  });

  describe("F2-30: signature is required in every environment", () => {
    const body = JSON.stringify({ event: "charge.completed", data: { tx_ref: "x", status: "successful" } });

    it("rejects a missing verif-hash header even when NODE_ENV is not production", async () => {
      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv("VERCEL_ENV", "");
      try {
        expect(await verifyFlutterwaveWebhookSignature(body, null)).toBe(false);
        expect(await verifyFlutterwaveWebhookSignature(body, "")).toBe(false);
      } finally {
        vi.unstubAllEnvs();
      }
    });

    it("rejects when no webhook hash is configured anywhere (no unsigned bypass)", async () => {
      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv("VERCEL_ENV", "");
      const { getFlutterwaveWebhookHash } = await import("@/lib/payments/flutterwave-server");
      // One env-level lookup per verify call below (tx_ref "x" has no checkout/meta tenant).
      vi.mocked(getFlutterwaveWebhookHash)
        .mockResolvedValueOnce(null as never)
        .mockResolvedValueOnce(null as never);
      try {
        expect(await verifyFlutterwaveWebhookSignature(body, null)).toBe(false);
        expect(await verifyFlutterwaveWebhookSignature(body, "anything")).toBe(false);
      } finally {
        vi.unstubAllEnvs();
      }
    });

    it("rejects a wrong hash", async () => {
      expect(await verifyFlutterwaveWebhookSignature(body, "nope")).toBe(false);
    });
  });
});
