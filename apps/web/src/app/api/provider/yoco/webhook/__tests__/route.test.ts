import crypto from "node:crypto";
import { describe, expect, it, vi } from "vitest";

const fromMock = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({ from: fromMock }),
}));

function signedBody(payload: unknown, secret: string) {
  const body = JSON.stringify(payload);
  const signature = crypto.createHmac("sha256", secret).update(body).digest("hex");
  return { body, signature };
}

describe("POST /api/provider/yoco/webhook", () => {
  it("accepts Checkout API webhook-signature without a webhook id", async () => {
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
});
