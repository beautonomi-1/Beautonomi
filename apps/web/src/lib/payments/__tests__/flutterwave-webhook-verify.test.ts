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
});
