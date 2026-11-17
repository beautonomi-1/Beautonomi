import crypto from "node:crypto";
import { describe, expect, it, vi } from "vitest";

const fromMock = vi.fn();
const rpcMock = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({ from: fromMock, rpc: rpcMock }),
}));

/** F-06 dedupe pre-check mock: no prior processed row for this event id. */
const dedupeMiss = () => ({
  eq: () => ({
    eq: () => ({ limit: async () => ({ data: [], error: null }) }),
    in: () => ({ limit: async () => ({ data: [], error: null }) }),
    limit: async () => ({ data: [], error: null }),
  }),
});

function mockLease(outcome: "acquired" | "duplicate") {
  rpcMock.mockResolvedValue({
    data: [
      outcome === "duplicate"
        ? { acquired: false, already_processed: true, stale_lease_reclaimed: false, status: "processed" }
        : { acquired: true, already_processed: false, stale_lease_reclaimed: false, status: "processing" },
    ],
    error: null,
  });
}

function signedBody(payload: unknown, secret: string) {
  const body = JSON.stringify(payload);
  const signature = crypto.createHmac("sha256", secret).update(body).digest("hex");
  return { body, signature };
}

describe("POST /api/provider/yoco/webhook", () => {
  it("accepts Checkout API webhook-signature without a webhook id", async () => {
    mockLease("acquired");
    const paymentUpdates: Array<Record<string, unknown>> = [];

    fromMock.mockImplementation((table: string) => {
      if (table === "provider_yoco_integrations") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: { webhook_secret: "checkout_secret" },
              })),
            })),
          })),
        };
      }
      if (table === "provider_yoco_webhook_events") {
        return {
          select: dedupeMiss,
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn(async () => ({ data: { id: "event-row" } })),
            })),
          })),
          update: vi.fn(() => ({
            eq: vi.fn(async () => ({ error: null })),
          })),
        };
      }
      if (table === "provider_yoco_payments") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: {
                  sale_id: null,
                  status: "pending",
                  device_id: null,
                  amount: null,
                  provider_id: "provider-1",
                },
              })),
            })),
          })),
          update: vi.fn((payload: Record<string, unknown>) => {
            paymentUpdates.push(payload);
            return { eq: vi.fn(async () => ({ error: null })) };
          }),
        };
      }
      if (table === "webhook_events") {
        return {
          update: () => ({
            eq: () => ({
              eq: async () => ({ error: null }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const event = {
      id: "evt_1",
      type: "payment.succeeded",
      payload: {
        id: "pay_1",
        amount: 1234,
        currency: "ZAR",
        status: "succeeded",
        metadata: { provider_id: "provider-1" },
      },
    };
    const { body, signature } = signedBody(event, "checkout_secret");
    const { POST } = await import("../route");

    const res = await POST(
      new Request("https://app/api/provider/yoco/webhook", {
        method: "POST",
        body,
        headers: { "webhook-signature": signature },
      }),
    );

    expect(res.status).toBe(200);
    expect(paymentUpdates).toContainEqual(
      expect.objectContaining({ status: "successful" }),
    );
  });

  it("does not mark Yoco API payment.created as successful", async () => {
    mockLease("acquired");
    const paymentUpdates: Array<Record<string, unknown>> = [];

    fromMock.mockImplementation((table: string) => {
      if (table === "provider_yoco_webhooks") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: { webhook_secret: "oauth_secret", provider_id: "provider-1" },
              })),
            })),
          })),
        };
      }
      if (table === "provider_yoco_webhook_events") {
        return {
          select: dedupeMiss,
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn(async () => ({ data: { id: "event-row" } })),
            })),
          })),
          update: vi.fn(() => ({
            eq: vi.fn(async () => ({ error: null })),
          })),
        };
      }
      if (table === "provider_yoco_payments") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: {
                  sale_id: null,
                  status: "pending",
                  device_id: null,
                  amount: null,
                  provider_id: "provider-1",
                },
              })),
            })),
          })),
          update: vi.fn((payload: Record<string, unknown>) => {
            paymentUpdates.push(payload);
            return { eq: vi.fn(async () => ({ error: null })) };
          }),
        };
      }
      if (table === "webhook_events") {
        return {
          update: () => ({
            eq: () => ({
              eq: async () => ({ error: null }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const event = {
      id: "evt_2",
      type: "payment.created",
      payload: {
        id: "pay_2",
        amount: { amount: 1234, currency: "ZAR" },
        metadata: { provider_id: "provider-1" },
      },
    };
    const { body, signature } = signedBody(event, "oauth_secret");
    const { POST } = await import("../route");

    const res = await POST(
      new Request("https://app/api/provider/yoco/webhook", {
        method: "POST",
        body,
        headers: {
          "x-yoco-signature": signature,
          "x-yoco-webhook-id": "wh_1",
        },
      }),
    );

    expect(res.status).toBe(200);
    expect(paymentUpdates).toContainEqual(
      expect.objectContaining({ status: "pending" }),
    );
  });

  it("stores a PII-redacted payload in provider_yoco_webhook_events (F2-69)", async () => {
    mockLease("acquired");
    const eventInserts: Array<Record<string, unknown>> = [];

    fromMock.mockImplementation((table: string) => {
      if (table === "provider_yoco_integrations") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: { webhook_secret: "checkout_secret" },
              })),
            })),
          })),
        };
      }
      if (table === "provider_yoco_webhook_events") {
        return {
          select: dedupeMiss,
          insert: vi.fn((row: Record<string, unknown>) => {
            eventInserts.push(row);
            return {
              select: vi.fn(() => ({
                single: vi.fn(async () => ({ data: { id: "event-row" } })),
              })),
            };
          }),
          update: vi.fn(() => ({
            eq: vi.fn(async () => ({ error: null })),
          })),
        };
      }
      if (table === "provider_yoco_payments") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: { sale_id: null, status: "pending", device_id: null, amount: null, provider_id: "provider-1" },
              })),
            })),
          })),
          update: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
        };
      }
      if (table === "webhook_events") {
        return {
          update: () => ({
            eq: () => ({
              eq: async () => ({ error: null }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const event = {
      id: "evt_3",
      type: "payment.succeeded",
      payload: {
        id: "pay_3",
        amount: 1234,
        currency: "ZAR",
        status: "succeeded",
        metadata: { provider_id: "provider-1" },
        card: { number: "4111111111111111", expiryMonth: "12", expiryYear: "2030", last4: "1111" },
        customer: { email: "jane@example.test", phone: "+27000000000" },
      },
    };
    const { body, signature } = signedBody(event, "checkout_secret");
    const { POST } = await import("../route");

    const res = await POST(
      new Request("https://app/api/provider/yoco/webhook", {
        method: "POST",
        body,
        headers: { "webhook-signature": signature },
      }),
    );

    expect(res.status).toBe(200);
    expect(eventInserts).toHaveLength(1);
    const stored = JSON.stringify(eventInserts[0]?.payload);
    expect(stored).not.toContain("4111111111111111");
    expect(stored).not.toContain("jane@example.test");
    expect(stored).not.toContain("+27000000000");
    expect(stored).toContain("pay_3");
    expect(stored).toContain("provider-1");
  });

  it("F-06: replayed event id already processed → 200 duplicate, no payment update, no new event row", async () => {
    mockLease("duplicate");
    const paymentUpdates: Array<Record<string, unknown>> = [];
    const eventInserts: Array<Record<string, unknown>> = [];

    fromMock.mockImplementation((table: string) => {
      if (table === "provider_yoco_integrations") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: { webhook_secret: "checkout_secret" } })),
            })),
          })),
        };
      }
      if (table === "provider_yoco_webhook_events") {
        const hit = async () => ({ data: [{ id: "prior", status: "processed" }], error: null });
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({ limit: hit }),
              in: () => ({ limit: hit }),
              limit: hit,
            }),
          }),
          insert: vi.fn((row: Record<string, unknown>) => {
            eventInserts.push(row);
            return { select: vi.fn(() => ({ single: vi.fn(async () => ({ data: { id: "event-row" } })) })) };
          }),
          update: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
        };
      }
      if (table === "provider_yoco_payments") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: { sale_id: null, status: "pending", device_id: null, amount: null, provider_id: "provider-1" },
              })),
            })),
          })),
          update: vi.fn((payload: Record<string, unknown>) => {
            paymentUpdates.push(payload);
            return { eq: vi.fn(async () => ({ error: null })) };
          }),
        };
      }
      if (table === "webhook_events") {
        return {
          update: () => ({
            eq: () => ({
              eq: async () => ({ error: null }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const event = {
      id: "evt_dup",
      type: "payment.succeeded",
      payload: { id: "pay_dup", amount: 1234, currency: "ZAR", status: "succeeded", metadata: { provider_id: "provider-1" } },
    };
    const { body, signature } = signedBody(event, "checkout_secret");
    const { POST } = await import("../route");

    const res = await POST(
      new Request("https://app/api/provider/yoco/webhook", {
        method: "POST",
        body,
        headers: { "webhook-signature": signature },
      }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ duplicate: true });
    expect(paymentUpdates).toHaveLength(0);
    expect(eventInserts).toHaveLength(0);
  });
});
