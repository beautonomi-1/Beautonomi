/**
 * Online Paystack holds stay payable after charge.failed.
 * Walk-in pending orders still cancel and release stock.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { processFailedPayment } from "../charge-success";
import type { PaystackChargeData, SupabaseClient } from "../shared";

const restock = vi.fn();
const creditWallet = vi.fn();
const voidGift = vi.fn();
const refundCards = vi.fn();
const insertNotification = vi.fn();
const sendTemplateNotification = vi.fn();

vi.mock("@/lib/wallet/enrich-wallet-topup-metadata-from-reference", () => ({
  enrichWalletTopupMetadataFromReference: vi.fn(async () => undefined),
}));

vi.mock("@/lib/orders/product-order-lifecycle", () => ({
  creditWalletForProductOrderIfNeeded: (...args: unknown[]) => creditWallet(...args),
  refundUnpaidProductOrderCardCharges: (...args: unknown[]) => refundCards(...args),
  restockProductOrderLineItems: (...args: unknown[]) => restock(...args),
  voidProductOrderGiftCardIfNeeded: (...args: unknown[]) => voidGift(...args),
}));

vi.mock("@/lib/notifications/onesignal", () => ({
  sendTemplateNotification: (...args: unknown[]) => sendTemplateNotification(...args),
}));

vi.mock("@/lib/notifications/insert-notification", () => ({
  insertNotification: (...args: unknown[]) => insertNotification(...args),
}));

vi.mock("@/lib/integrations/slack/ops-triggers", () => ({
  slackNotifyPaymentFailed: vi.fn(),
  slackNotifyUnrecognizedPayments: vi.fn(),
}));

function charge(reference: string, orderId: string): PaystackChargeData {
  return {
    reference,
    amount: 10000,
    message: "Declined",
    gateway_response: "Declined",
    metadata: { product_order_id: orderId },
  } as PaystackChargeData;
}

function supabaseFor(order: Record<string, unknown>, claimRows: Array<{ id: string }>) {
  const updates: Array<Record<string, unknown>> = [];
  const client = {
    from: vi.fn((table: string) => {
      if (table !== "product_orders") {
        throw new Error(`unexpected table ${table}`);
      }
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: order, error: null }),
          }),
        }),
        update: (payload: Record<string, unknown>) => {
          updates.push(payload);
          const terminal = {
            eq: () => terminal,
            select: async () => ({ data: claimRows, error: null }),
          };
          return terminal;
        },
      };
    }),
  };
  return { client: client as unknown as SupabaseClient, updates };
}

describe("charge.failed product order holds", () => {
  beforeEach(() => {
    restock.mockReset();
    creditWallet.mockReset();
    voidGift.mockReset();
    refundCards.mockReset();
    insertNotification.mockReset();
    sendTemplateNotification.mockReset();
  });

  it("leaves an online Paystack hold pending and notifies once per reference", async () => {
    const order = {
      id: "order-1",
      customer_id: "cust-1",
      provider_id: "prov-1",
      tenant_id: "tenant-1",
      wallet_amount: 20,
      gift_card_amount: 10,
      currency: "ZAR",
      payment_status: "pending",
      status: "pending",
      order_number: "PO-1",
      order_source: "online",
      payment_method: "paystack",
      payment_attempt_note: null,
      cancellation_reason: null,
    };
    const { client, updates } = supabaseFor(order, [{ id: "order-1" }]);

    await processFailedPayment(charge("ref-1", "order-1"), client);

    expect(updates).toHaveLength(1);
    expect(updates[0]?.payment_attempt_note).toBe("ref-1: Declined");
    expect(updates[0]).not.toHaveProperty("status");
    expect(updates[0]).not.toHaveProperty("cancellation_reason");
    expect(restock).not.toHaveBeenCalled();
    expect(creditWallet).not.toHaveBeenCalled();
    expect(voidGift).not.toHaveBeenCalled();
    expect(refundCards).not.toHaveBeenCalled();
    expect(insertNotification).toHaveBeenCalledTimes(1);

    order.payment_attempt_note = "ref-1: Declined";
    await processFailedPayment(charge("ref-1", "order-1"), client);
    expect(updates).toHaveLength(1);
    expect(insertNotification).toHaveBeenCalledTimes(1);
  });

  it("still cancels a walk-in pending order", async () => {
    const order = {
      id: "order-2",
      customer_id: "cust-1",
      provider_id: "prov-1",
      payment_status: "pending",
      status: "pending",
      order_source: "walk_in",
      payment_method: "paystack",
      order_number: "PO-2",
    };
    const { client, updates } = supabaseFor(order, [{ id: "order-2" }]);

    await processFailedPayment(charge("ref-2", "order-2"), client);

    expect(updates[0]).toMatchObject({
      payment_status: "failed",
      status: "cancelled",
      cancellation_reason: "Card payment failed",
    });
    expect(restock).toHaveBeenCalled();
  });
});
