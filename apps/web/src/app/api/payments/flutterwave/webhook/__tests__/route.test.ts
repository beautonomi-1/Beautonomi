/**
 * F2-30 / F-06: Flutterwave webhook must use the shared
 * `try_acquire_webhook_event_lease` RPC (same as Paystack/Stripe/Apple), must
 * derive a deterministic event id from the payload (never random) and must
 * reject events that carry no usable id.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const verifyMock = vi.fn();
const settleMock = vi.fn();
const transferMock = vi.fn();
const disputeMock = vi.fn();
const rpcMock = vi.fn();
const fromMock = vi.fn();

vi.mock("@/lib/payments/flutterwave-webhook-verify", () => ({
  verifyFlutterwaveWebhookSignature: (...args: unknown[]) => verifyMock(...args),
}));
vi.mock("@/lib/payments/settle-flutterwave-online-payment", () => ({
  settleFlutterwaveChargeWebhookData: (...args: unknown[]) => settleMock(...args),
}));
vi.mock("@/lib/payments/flutterwave-transfer-webhook", () => ({
  handleFlutterwaveTransferWebhook: (...args: unknown[]) => transferMock(...args),
}));
vi.mock("@/lib/payments/flutterwave-dispute-handler", () => ({
  handleFlutterwaveDisputeWebhook: (...args: unknown[]) => disputeMock(...args),
}));
vi.mock("@/lib/payment/persist-failed-webhook-signature", () => ({
  persistFailedWebhookSignature: vi.fn(async () => undefined),
}));
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({ from: fromMock, rpc: rpcMock }),
}));

function post(payload: unknown, headers: Record<string, string> = { "verif-hash": "sig" }) {
  return new Request("https://app/api/payments/flutterwave/webhook", {
    method: "POST",
    body: JSON.stringify(payload),
    headers,
  });
}

function leaseResult(partial: Partial<{ acquired: boolean; already_processed: boolean; stale_lease_reclaimed: boolean }>) {
  return {
    data: [
      {
        acquired: true,
        already_processed: false,
        stale_lease_reclaimed: false,
        status: "processing",
        ...partial,
      },
    ],
    error: null,
  };
}

describe("POST /api/payments/flutterwave/webhook — lease + deterministic event id", () => {
  const updates: Array<Record<string, unknown>> = [];

  beforeEach(() => {
    vi.clearAllMocks();
    updates.length = 0;
    verifyMock.mockResolvedValue(true);
    settleMock.mockResolvedValue(undefined);
    transferMock.mockResolvedValue({ handled: true });
    rpcMock.mockResolvedValue(leaseResult({}));
    fromMock.mockImplementation((table: string) => {
      if (table === "webhook_events") {
        return {
          update: vi.fn((values: Record<string, unknown>) => {
            updates.push(values);
            return { eq: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })) };
          }),
          // select-then-insert must NOT be used any more
          select: vi.fn(() => {
            throw new Error("select-then-insert path must not be used (F-06)");
          }),
          insert: vi.fn(() => {
            throw new Error("direct insert must not be used when the lease RPC works (F-06)");
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    });
  });

  it("acquires the lease with a deterministic id derived from event type + data.id", async () => {
    const { POST } = await import("../route");
    const res = await POST(
      post({ event: "charge.completed", data: { id: 987654, tx_ref: "bk-1", status: "successful" } }),
    );
    expect(res.status).toBe(200);
    expect(rpcMock).toHaveBeenCalledWith(
      "try_acquire_webhook_event_lease",
      expect.objectContaining({
        p_event_id: "charge.completed:987654",
        p_source: "flutterwave",
        p_event_type: "charge.completed",
      }),
    );
    expect(settleMock).toHaveBeenCalledTimes(1);
    expect(updates.some((u) => u.status === "processed")).toBe(true);
  });

  it("falls back to tx_ref (+status) when data.id is missing — never a random id", async () => {
    const { POST } = await import("../route");
    const res1 = await POST(post({ event: "charge.completed", data: { tx_ref: "bk-2", status: "successful" } }));
    const res2 = await POST(post({ event: "charge.completed", data: { tx_ref: "bk-2", status: "successful" } }));
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    const ids = rpcMock.mock.calls.map((c) => (c[1] as { p_event_id: string }).p_event_id);
    expect(ids).toHaveLength(2);
    expect(ids[0]).toBe(ids[1]);
    expect(ids[0]).toContain("bk-2");
  });

  it("rejects an event without any id / tx_ref with 400 and processes nothing", async () => {
    const { POST } = await import("../route");
    const res = await POST(post({ event: "charge.completed", data: { status: "successful" } }));
    expect(res.status).toBe(400);
    expect(rpcMock).not.toHaveBeenCalled();
    expect(settleMock).not.toHaveBeenCalled();
  });

  it("returns duplicate when the lease says already processed and does not run the handler", async () => {
    rpcMock.mockResolvedValueOnce(leaseResult({ acquired: false, already_processed: true }));
    const { POST } = await import("../route");
    const res = await POST(post({ event: "charge.completed", data: { id: 1, tx_ref: "bk-3" } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ duplicate: true });
    expect(settleMock).not.toHaveBeenCalled();
  });

  it("returns 503 when another worker holds the lease", async () => {
    rpcMock.mockResolvedValueOnce(leaseResult({ acquired: false, already_processed: false }));
    const { POST } = await import("../route");
    const res = await POST(post({ event: "charge.completed", data: { id: 2, tx_ref: "bk-4" } }));
    expect(res.status).toBe(503);
    expect(settleMock).not.toHaveBeenCalled();
  });

  it("rejects an unsigned request with 401 before touching the DB", async () => {
    verifyMock.mockResolvedValueOnce(false);
    const { POST } = await import("../route");
    const res = await POST(post({ event: "charge.completed", data: { id: 3 } }, {}));
    expect(res.status).toBe(401);
    expect(rpcMock).not.toHaveBeenCalled();
    expect(settleMock).not.toHaveBeenCalled();
  });
});
