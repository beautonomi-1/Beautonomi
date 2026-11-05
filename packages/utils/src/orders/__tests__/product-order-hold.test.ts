import { describe, expect, it } from "vitest";
import { isProductOrderFulfillmentQueueRow, isUnpaidOnlinePaystackHold } from "../product-order-hold";

describe("isUnpaidOnlinePaystackHold", () => {
  it("matches online paystack pending", () => {
    expect(
      isUnpaidOnlinePaystackHold({
        order_source: "online",
        payment_method: "paystack",
        payment_status: "pending",
        status: "pending",
      }),
    ).toBe(true);
  });

  it("matches null method as paystack", () => {
    expect(
      isUnpaidOnlinePaystackHold({
        order_source: "online",
        payment_method: null,
        payment_status: "pending",
        status: "pending",
      }),
    ).toBe(true);
  });

  it("excludes online cash pending", () => {
    expect(
      isUnpaidOnlinePaystackHold({
        order_source: "online",
        payment_method: "cash",
        payment_status: "pending",
        status: "pending",
      }),
    ).toBe(false);
  });

  it("excludes walk-in and appointment", () => {
    expect(
      isUnpaidOnlinePaystackHold({
        order_source: "walk_in",
        payment_method: "paystack",
        payment_status: "pending",
        status: "pending",
      }),
    ).toBe(false);
    expect(
      isUnpaidOnlinePaystackHold({
        order_source: "appointment",
        payment_method: "paystack",
        payment_status: "pending",
        status: "pending",
      }),
    ).toBe(false);
  });

  it("excludes paid and cancelled", () => {
    expect(
      isUnpaidOnlinePaystackHold({
        order_source: "online",
        payment_method: "paystack",
        payment_status: "paid",
        status: "confirmed",
      }),
    ).toBe(false);
    expect(
      isUnpaidOnlinePaystackHold({
        order_source: "online",
        payment_method: "paystack",
        payment_status: "pending",
        status: "cancelled",
      }),
    ).toBe(false);
  });
});

describe("isProductOrderFulfillmentQueueRow", () => {
  it("is complement of hold", () => {
    const hold = {
      order_source: "online",
      payment_method: "paystack",
      payment_status: "pending",
      status: "pending",
    };
    expect(isProductOrderFulfillmentQueueRow(hold)).toBe(false);
    expect(isProductOrderFulfillmentQueueRow({ ...hold, payment_method: "cash" })).toBe(true);
  });
});
