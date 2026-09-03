import { beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "crypto";
import { NextResponse } from "next/server";

/**
 * FND-P0-002 (REM-006) — Money-path webhook integration coverage.
 *
 * Exercises the REAL `POST /api/payments/webhook` router end-to-end (no staging)
 * to prove the two security/financial-integrity invariants that guard every
 * money-movement event:
 *
 *   1. HMAC-SHA512 signature verification (forged/unsigned events are rejected
 *      before any handler or ledger write runs).
 *   2. Idempotency — a replayed `charge.success` event is acknowledged as a
 *      duplicate and NEVER re-dispatched to the charge handler (no double
 *      payment / double ledger entry).
 *
 * Only external boundaries are mocked (Supabase admin, Paystack secret lookup,
 * per-event handlers). The signature gate, event parsing, lease/idempotency
 * branching and handler routing are the code under test.
 */

const TEST_SECRET = "sk_test_money_path_secret";
const TENANT_ID = "tenant-za-1";

const mockGetPaystackSecretKey = vi.fn(async () => TEST_SECRET);
const mockResolveTenantFromRequest = vi.fn(async () => ({ id: TENANT_ID }));
const mockResolvePaymentWebhookTenantId = vi.fn(async () => TENANT_ID);
const mockHandleChargeSuccess = vi.fn(async () =>
  NextResponse.json({ received: true, handled: "charge.success" }),
);
const mockHandleChargeFailed = vi.fn(async () =>
  NextResponse.json({ received: true, handled: "charge.failed" }),
);
const mockTryAcquireLease = vi.fn();
const adminFrom = vi.fn();

vi.mock("@/lib/payments/paystack-server", () => ({
  getPaystackSecretKey: (...args: unknown[]) => mockGetPaystackSecretKey(...(args as [])),
}));

vi.mock("@/lib/tenant/resolve-tenant-from-db", () => ({
  resolveTenantFromRequest: (...args: unknown[]) => mockResolveTenantFromRequest(...(args as [])),
}));

vi.mock("@/lib/payment/resolve-payment-webhook-tenant", () => ({
  extractBookingIdFromPaystackPayloadData: () => "booking-1",
  resolvePaymentWebhookTenantId: (...args: unknown[]) =>
    mockResolvePaymentWebhookTenantId(...(args as [])),
}));

vi.mock("../_handlers/charge-success", () => ({
  handleChargeSuccess: (...args: unknown[]) => mockHandleChargeSuccess(...(args as [])),
  handleChargeFailed: (...args: unknown[]) => mockHandleChargeFailed(...(args as [])),
}));

const mockHandleTransferEvent = vi.fn(async () =>
  NextResponse.json({ received: true, handled: "transfer" }),
);
const mockHandleRefundEvent = vi.fn(async () =>
  NextResponse.json({ received: true, handled: "refund" }),
);

vi.mock("../_handlers/subscription-events", () => ({ handleSubscriptionEvent: vi.fn() }));
vi.mock("../_handlers/transfer-events", () => ({
  handleTransferEvent: (...args: unknown[]) => mockHandleTransferEvent(...(args as [])),
}));
vi.mock("../_handlers/refund-events", () => ({
  handleRefundEvent: (...args: unknown[]) => mockHandleRefundEvent(...(args as [])),
}));

vi.mock("@/lib/payment/webhook-idempotency", () => ({
  tryRecordPaymentWebhookEvent: vi.fn(async () => ({ inserted: true })),
}));

vi.mock("@/lib/payment/webhook-payload-sanitizer", () => ({
  sanitizeWebhookPayload: (e: unknown) => e,
}));

const mockPersistFailedWebhookSignature = vi.fn(async () => undefined);
vi.mock("@/lib/payment/persist-failed-webhook-signature", () => ({
  persistFailedWebhookSignature: (...args: unknown[]) =>
    mockPersistFailedWebhookSignature(...(args as [])),
}));

vi.mock("@/lib/monitoring/route-metrics", () => ({
  withRouteMetrics: (_req: Request, _route: string, _method: string, handler: () => Promise<Response>) =>
    handler(),
}));

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({
    from: adminFrom,
    rpc: (fn: string, args: unknown) => mockTryAcquireLease(fn, args),
  }),
}));

/** Minimal chainable stub for the incidental `.from(...)` calls in the router. */
function tableStub(rows: Record<string, unknown> | null = null) {
  const api: Record<string, unknown> = {};
  const self = () => api;
  for (const m of ["select", "eq", "update", "insert", "delete", "in"]) api[m] = vi.fn(self);
  api.maybeSingle = vi.fn(async () => ({ data: rows, error: null }));
  api.single = vi.fn(async () => ({ data: rows, error: null }));
  // Terminal update chains (.eq().eq()) resolve as thenable.
  api.then = undefined;
  return api;
}

function sign(body: string, secret = TEST_SECRET): string {
  return crypto.createHmac("sha512", secret).update(body).digest("hex");
}

function makeRequest(body: string, signature?: string): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (signature !== undefined) headers["x-paystack-signature"] = signature;
  return new Request("https://www.beautonomi.co.za/api/payments/webhook", {
    method: "POST",
    headers,
    body,
  });
}

function chargeSuccessBody(reference = "ref-money-1"): string {
  return JSON.stringify({
    event: "charge.success",
    id: `evt_${reference}`,
    data: {
      reference,
      amount: 10000,
      metadata: { booking_id: "booking-1", tenant_id: TENANT_ID },
    },
  });
}

describe("POST /api/payments/webhook — signature & idempotency (money path)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPaystackSecretKey.mockResolvedValue(TEST_SECRET);
    mockResolveTenantFromRequest.mockResolvedValue({ id: TENANT_ID });
    mockResolvePaymentWebhookTenantId.mockResolvedValue(TENANT_ID);
    // Default supabase table behaviour: `tenants` slug=za lookup + webhook_events updates.
    adminFrom.mockImplementation((table: string) => {
      if (table === "tenants") return tableStub({ id: TENANT_ID });
      return tableStub(null);
    });
    // Fresh lease acquired by default (new event, first delivery).
    mockTryAcquireLease.mockResolvedValue({
      data: [{ acquired: true, already_processed: false, stale_lease_reclaimed: false, status: "processing" }],
      error: null,
    });
  });

  it("rejects a request with no signature (400) before any handler runs", async () => {
    const { POST } = await import("../route");
    const res = await POST(makeRequest(chargeSuccessBody()));
    expect(res.status).toBe(400);
    expect(mockHandleChargeSuccess).not.toHaveBeenCalled();
  });

  it("rejects a forged/invalid signature (401) before any handler runs", async () => {
    const { POST } = await import("../route");
    const body = chargeSuccessBody();
    const res = await POST(makeRequest(body, "deadbeef".repeat(16)));
    expect(res.status).toBe(401);
    expect(mockHandleChargeSuccess).not.toHaveBeenCalled();
  });

  it("persists a rejected signature to webhook_events (forensics) and still returns 401", async () => {
    const { POST } = await import("../route");
    const body = chargeSuccessBody("ref-sigfail");
    const res = await POST(makeRequest(body, "deadbeef".repeat(16)));
    expect(res.status).toBe(401);
    expect(mockPersistFailedWebhookSignature).toHaveBeenCalledTimes(1);
    expect(mockPersistFailedWebhookSignature).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        source: "paystack",
        body,
        errorMessage: expect.stringContaining("HMAC mismatch"),
        parsedPayload: expect.objectContaining({ event: "charge.success" }),
      }),
    );
    expect(mockHandleChargeSuccess).not.toHaveBeenCalled();
  });

  it("does not persist a signature failure for a correctly signed event", async () => {
    const { POST } = await import("../route");
    const body = chargeSuccessBody("ref-valid-nopersist");
    const res = await POST(makeRequest(body, sign(body)));
    expect(res.status).toBe(200);
    expect(mockPersistFailedWebhookSignature).not.toHaveBeenCalled();
  });

  it("accepts a correctly HMAC-SHA512-signed charge.success and dispatches to the handler", async () => {
    const { POST } = await import("../route");
    const body = chargeSuccessBody("ref-valid");
    const res = await POST(makeRequest(body, sign(body)));
    expect(res.status).toBe(200);
    expect(mockHandleChargeSuccess).toHaveBeenCalledTimes(1);
    const json = await res.json();
    expect(json).toMatchObject({ handled: "charge.success" });
  });

  it("verifies against a per-tenant secret even when the host tenant secret differs", async () => {
    // Host tenant secret is wrong; the correct signing secret belongs to the
    // payload-derived candidate tenant. The router must still accept it.
    const correctSecret = "sk_test_provider_tenant";
    mockGetPaystackSecretKey.mockImplementation(async (opts?: { tenantId?: string | null }) => {
      return opts?.tenantId === TENANT_ID ? "sk_test_wrong_host" : correctSecret;
    });
    mockResolvePaymentWebhookTenantId.mockResolvedValue("provider-tenant");
    const { POST } = await import("../route");
    const body = chargeSuccessBody("ref-multitenant");
    const res = await POST(makeRequest(body, sign(body, correctSecret)));
    expect(res.status).toBe(200);
    expect(mockHandleChargeSuccess).toHaveBeenCalledTimes(1);
  });

  it("treats a replayed event as a duplicate and does NOT re-dispatch (idempotency)", async () => {
    mockTryAcquireLease.mockResolvedValue({
      data: [{ acquired: false, already_processed: true, stale_lease_reclaimed: false, status: "processed" }],
      error: null,
    });
    const { POST } = await import("../route");
    const body = chargeSuccessBody("ref-replay");
    const res = await POST(makeRequest(body, sign(body)));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ duplicate: true });
    expect(mockHandleChargeSuccess).not.toHaveBeenCalled();
  });

  it("routes a signed refund.processed event to the refund handler", async () => {
    const { POST } = await import("../route");
    const body = JSON.stringify({
      event: "refund.processed",
      id: "evt_refund_1",
      data: { reference: "ref-refund", metadata: { booking_id: "booking-1" } },
    });
    const res = await POST(makeRequest(body, sign(body)));
    expect(res.status).toBe(200);
    expect(mockHandleRefundEvent).toHaveBeenCalledTimes(1);
    expect(mockHandleChargeSuccess).not.toHaveBeenCalled();
  });

  it("routes a signed transfer.success (payout) event to the transfer handler", async () => {
    const { POST } = await import("../route");
    const body = JSON.stringify({
      event: "transfer.success",
      id: "evt_transfer_1",
      data: { reference: "ref-payout", metadata: { booking_id: "booking-1" } },
    });
    const res = await POST(makeRequest(body, sign(body)));
    expect(res.status).toBe(200);
    expect(mockHandleTransferEvent).toHaveBeenCalledTimes(1);
  });

  it("does not re-dispatch while another live worker holds the lease", async () => {
    mockTryAcquireLease.mockResolvedValue({
      data: [{ acquired: false, already_processed: false, stale_lease_reclaimed: false, status: "processing" }],
      error: null,
    });
    const { POST } = await import("../route");
    const body = chargeSuccessBody("ref-inflight");
    const res = await POST(makeRequest(body, sign(body)));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ processing: true });
    expect(mockHandleChargeSuccess).not.toHaveBeenCalled();
  });
});
