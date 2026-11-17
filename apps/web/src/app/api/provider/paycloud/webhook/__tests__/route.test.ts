/**
 * F2-37 / F-06: PayCloud webhook must verify the RSA2 signature BEFORE looking
 * up any payment row (no enumeration oracle), return 401 on an invalid
 * signature, and dedupe on a deterministic event id via the shared lease RPC.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const verifyMock = vi.fn();
const resolveKeysMock = vi.fn();
const settleMock = vi.fn();
const rpcMock = vi.fn();
const fromMock = vi.fn();

vi.mock("@/lib/payments/paycloud-client", () => ({
  verifyPaycloudWebhookSignature: (...args: unknown[]) => verifyMock(...args),
}));
vi.mock("@/lib/payments/resolve-paycloud-app-credentials", () => ({
  resolvePaycloudGatewayPublicKey: vi.fn(async () => "KEY"),
  resolvePaycloudWebhookGatewayPublicKeys: (...args: unknown[]) => resolveKeysMock(...args),
}));
vi.mock("@/lib/payments/settle-paycloud-payment", () => ({
  settlePaycloudPayment: (...args: unknown[]) => settleMock(...args),
}));
vi.mock("@/lib/payments/paycloud-post-settle", () => ({
  handlePaycloudPostSettle: vi.fn(async () => undefined),
}));
vi.mock("@/lib/payments/paycloud-void", () => ({
  isPaycloudVoidRow: () => false,
  completePaycloudVoid: vi.fn(),
}));
vi.mock("@/lib/payments/paycloud-refund", () => ({
  isPaycloudRefundRow: () => false,
  completePaycloudRefund: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({ from: fromMock, rpc: rpcMock }),
}));

const notifyBody = {
  app_id: "app-1",
  merchant_order_no: "BN-ORDER-1",
  trans_no: "PC-TRANS-1",
  trans_status: "2",
  paid_amount: "100.00",
  sign: "sig",
};

function post(body: unknown) {
  return new NextRequest("https://app/api/provider/paycloud/webhook", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

function leaseResult(partial: Partial<{ acquired: boolean; already_processed: boolean }>) {
  return {
    data: [{ acquired: true, already_processed: false, stale_lease_reclaimed: false, status: "processing", ...partial }],
    error: null,
  };
}

describe("POST /api/provider/paycloud/webhook", () => {
  const tablesTouched: string[] = [];
  const eventInserts: Array<Record<string, unknown>> = [];

  beforeEach(() => {
    vi.clearAllMocks();
    tablesTouched.length = 0;
    eventInserts.length = 0;
    resolveKeysMock.mockResolvedValue(["KEY"]);
    verifyMock.mockReturnValue(true);
    rpcMock.mockResolvedValue(leaseResult({}));
    settleMock.mockResolvedValue({ ok: true });
    fromMock.mockImplementation((table: string) => {
      tablesTouched.push(table);
      if (table === "paycloud_webhook_events") {
        return {
          insert: vi.fn(async (row: Record<string, unknown>) => {
            eventInserts.push(row);
            return { error: null };
          }),
          update: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
        };
      }
      if (table === "webhook_events") {
        return { update: vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })) })) };
      }
      if (table === "provider_paycloud_payments") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: {
                  id: "pay-1",
                  terminal_id: "term-1",
                  provider_id: "prov-1",
                  tenant_id: "tenant-1",
                  currency: "ZAR",
                  amount: 100,
                  expected_amount: 100,
                  tip_amount: 0,
                  cashback_amount: 0,
                  entity_type: "booking",
                  entity_id: "bk-1",
                  metadata: {},
                },
                error: null,
              })),
            })),
          })),
          update: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
        };
      }
      if (table === "paycloud_terminals") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: { paycloud_merchant_id: "m-1", tenant_id: "tenant-1" } })),
            })),
          })),
          update: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
        };
      }
      if (table === "paycloud_merchants") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: { paycloud_app_id: "app-1", environment: "live", tenant_id: "tenant-1" },
              })),
            })),
          })),
        };
      }
      throw new Error(`unexpected table ${table}`);
    });
  });

  it("F2-37: invalid signature → 401 and NO payment/terminal/merchant lookup", async () => {
    verifyMock.mockReturnValue(false);
    const { POST } = await import("../route");
    const res = await POST(post(notifyBody));
    expect(res.status).toBe(401);
    expect(tablesTouched).not.toContain("provider_paycloud_payments");
    expect(tablesTouched).not.toContain("paycloud_terminals");
    expect(tablesTouched).not.toContain("paycloud_merchants");
    expect(settleMock).not.toHaveBeenCalled();
    expect(rpcMock).not.toHaveBeenCalled();
    // forensics row still written, flagged invalid
    expect(eventInserts.some((e) => e.signature_valid === false)).toBe(true);
  });

  it("verifies the signature before any payment lookup when valid", async () => {
    const { POST } = await import("../route");
    const res = await POST(post(notifyBody));
    expect(res.status).toBe(200);
    expect(verifyMock).toHaveBeenCalled();
    const verifyOrder = verifyMock.mock.invocationCallOrder[0];
    const paymentLookupIdx = tablesTouched.indexOf("provider_paycloud_payments");
    expect(paymentLookupIdx).toBeGreaterThanOrEqual(0);
    // from() is called in order; the first payment lookup must happen after verify.
    const fromOrderAtPaymentLookup = fromMock.mock.invocationCallOrder[paymentLookupIdx];
    expect(fromOrderAtPaymentLookup).toBeGreaterThan(verifyOrder);
    expect(settleMock).toHaveBeenCalledTimes(1);
  });

  it("F-06: acquires the shared lease with a deterministic event id", async () => {
    const { POST } = await import("../route");
    await POST(post(notifyBody));
    expect(rpcMock).toHaveBeenCalledWith(
      "try_acquire_webhook_event_lease",
      expect.objectContaining({
        p_source: "paycloud",
        p_event_id: "PC-TRANS-1:2",
      }),
    );
  });

  it("F-06: duplicate event → 200 and nothing settles", async () => {
    rpcMock.mockResolvedValueOnce(leaseResult({ acquired: false, already_processed: true }));
    const { POST } = await import("../route");
    const res = await POST(post(notifyBody));
    expect(res.status).toBe(200);
    expect(settleMock).not.toHaveBeenCalled();
    expect(tablesTouched).not.toContain("provider_paycloud_payments");
  });

  it("F-06: in-flight event → 503 and nothing settles", async () => {
    rpcMock.mockResolvedValueOnce(leaseResult({ acquired: false, already_processed: false }));
    const { POST } = await import("../route");
    const res = await POST(post(notifyBody));
    expect(res.status).toBe(503);
    expect(settleMock).not.toHaveBeenCalled();
  });
});
