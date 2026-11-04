import { describe, expect, it, vi } from "vitest";
import {
  amountStillDueForProductOrder,
  priorProductOrderCardPayments,
  productOrderAmountStillDue,
  productOrderPaystackChargeIsAllowed,
  withProductOrderAmountStillDue,
} from "../resolve-paystack-initialize-amount";

describe("productOrderAmountStillDue", () => {
  it("subtracts wallet, gift, and card charges already recorded", () => {
    expect(
      productOrderAmountStillDue({ total: 100, wallet: 20, gift: 0, priorCardPayments: 60 }),
    ).toBe(20);
  });
});

describe("amountStillDueForProductOrder", () => {
  it("leaves the card remainder on an unpaid order and nothing on a paid order", () => {
    expect(
      amountStillDueForProductOrder(
        { payment_status: "pending", total_amount: 100, wallet_amount: 0, gift_card_amount: 40 },
        0,
      ),
    ).toBe(60);
    expect(
      amountStillDueForProductOrder(
        { payment_status: "pending", total_amount: 100, wallet_amount: 0, gift_card_amount: 0 },
        60,
      ),
    ).toBe(40);
    expect(
      amountStillDueForProductOrder(
        { payment_status: "paid", total_amount: 100, wallet_amount: 0, gift_card_amount: 0 },
        60,
      ),
    ).toBe(0);
  });
});

describe("productOrderPaystackChargeIsAllowed", () => {
  it("accepts the first card charge for the amount still owed", () => {
    expect(
      productOrderPaystackChargeIsAllowed({
        total: 100,
        wallet: 0,
        gift: 40,
        priorCardPayments: 0,
        amountMajor: 60,
        referenceAlreadyRecorded: false,
      }),
    ).toBe(true);
  });

  it("accepts a later charge for the remainder after an earlier card payment", () => {
    const prior = priorProductOrderCardPayments(
      [{ amount: 60, reference: "first" }],
      "second",
    );
    expect(prior).toEqual({ priorCardPayments: 60, referenceAlreadyRecorded: false });
    expect(
      productOrderPaystackChargeIsAllowed({
        total: 100,
        wallet: 0,
        gift: 0,
        priorCardPayments: prior.priorCardPayments,
        amountMajor: 40,
        referenceAlreadyRecorded: prior.referenceAlreadyRecorded,
      }),
    ).toBe(true);
  });

  it("rejects a second full charge after part of the order was already paid", () => {
    expect(
      productOrderPaystackChargeIsAllowed({
        total: 100,
        wallet: 0,
        gift: 0,
        priorCardPayments: 60,
        amountMajor: 100,
        referenceAlreadyRecorded: false,
      }),
    ).toBe(false);
  });

  it("accepts a repeat of a charge that was already recorded", () => {
    const prior = priorProductOrderCardPayments(
      [{ amount: 60, reference: "first" }],
      "first",
    );
    expect(prior.referenceAlreadyRecorded).toBe(true);
    expect(prior.priorCardPayments).toBe(0);
    expect(
      productOrderPaystackChargeIsAllowed({
        total: 100,
        wallet: 0,
        gift: 0,
        priorCardPayments: prior.priorCardPayments,
        amountMajor: 60,
        referenceAlreadyRecorded: true,
      }),
    ).toBe(true);
  });
});

describe("withProductOrderAmountStillDue", () => {
  it("attaches card remainder on pending orders and zero when paid", async () => {
    const orderId = "33333333-3333-4333-8333-333333333333";
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            or: vi.fn(async () => ({
              data: [{ amount: 60, metadata: { product_order_id: orderId } }],
              error: null,
            })),
          })),
        })),
      })),
    };

    const [pending] = await withProductOrderAmountStillDue(supabase as never, [
      {
        id: orderId,
        payment_status: "pending",
        total_amount: 100,
        wallet_amount: 0,
        gift_card_amount: 0,
      },
    ]);
    expect(pending?.amount_still_due).toBe(40);

    const [paid] = await withProductOrderAmountStillDue(supabase as never, [
      {
        id: orderId,
        payment_status: "paid",
        total_amount: 100,
        wallet_amount: 0,
        gift_card_amount: 0,
      },
    ]);
    expect(paid?.amount_still_due).toBe(0);
  });

  it("sets amount_still_due null when card payment lookup fails", async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            or: vi.fn(async () => ({ data: null, error: { message: "fail" } })),
          })),
        })),
      })),
    };

    const [row] = await withProductOrderAmountStillDue(supabase as never, [
      {
        id: "33333333-3333-4333-8333-333333333333",
        payment_status: "pending",
        total_amount: 100,
      },
    ]);
    expect(row?.amount_still_due).toBeNull();
  });
});
