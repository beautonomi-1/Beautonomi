import { describe, expect, it, vi } from "vitest";
import {
  customerCanPayProductOrderOnline,
  isProductOrderFulfillmentQueueRow,
  isUnpaidOnlinePaystackHold,
  PAYABLE_PRODUCT_ORDER_PAGE_LIMIT,
  pinPayableProductOrders,
  scanPayableProductOrders,
} from "../product-order-hold";

const hold = {
  order_source: "online",
  payment_method: "paystack",
  payment_status: "pending",
  status: "pending",
};

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
    expect(isProductOrderFulfillmentQueueRow(hold)).toBe(false);
    expect(isProductOrderFulfillmentQueueRow({ ...hold, payment_method: "cash" })).toBe(true);
  });
});

describe("customerCanPayProductOrderOnline", () => {
  it("matches a hold with a positive due", () => {
    expect(customerCanPayProductOrderOnline({ ...hold, amount_still_due: 40 })).toBe(true);
  });

  it("excludes zero, null, and missing due", () => {
    expect(customerCanPayProductOrderOnline({ ...hold, amount_still_due: 0 })).toBe(false);
    expect(customerCanPayProductOrderOnline({ ...hold, amount_still_due: null })).toBe(false);
    expect(customerCanPayProductOrderOnline(hold)).toBe(false);
  });

  it("excludes cash and walk-in even when money is due", () => {
    expect(
      customerCanPayProductOrderOnline({ ...hold, payment_method: "cash", amount_still_due: 10 }),
    ).toBe(false);
    expect(
      customerCanPayProductOrderOnline({ ...hold, order_source: "walk_in", amount_still_due: 10 }),
    ).toBe(false);
  });

  it("excludes paid orders", () => {
    expect(
      customerCanPayProductOrderOnline({
        ...hold,
        payment_status: "paid",
        status: "confirmed",
        amount_still_due: 10,
      }),
    ).toBe(false);
  });
});

describe("pinPayableProductOrders", () => {
  it("keeps payable rows first and the original order inside each group", () => {
    const paid = { id: "paid", ...hold, payment_status: "paid", status: "confirmed", amount_still_due: 0 };
    const dueB = { id: "b", ...hold, amount_still_due: 20 };
    const dueA = { id: "a", ...hold, amount_still_due: 10 };
    expect(pinPayableProductOrders([paid, dueB, dueA]).map((order) => order.id)).toEqual(["b", "a", "paid"]);
  });
});

describe("scanPayableProductOrders", () => {
  const due = { ...hold, amount_still_due: 15 };
  const paid = { ...hold, payment_status: "paid", status: "confirmed", amount_still_due: 0 };

  it("includes the last full page and filters to payable rows", async () => {
    const full = Array.from({ length: PAYABLE_PRODUCT_ORDER_PAGE_LIMIT }, (_, i) =>
      i === 0 ? due : paid,
    );
    const fetchPage = vi.fn(async (page: number) => {
      if (page === 1) return { orders: full, totalPages: 2 };
      return { orders: [{ ...due, amount_still_due: 8 }], totalPages: 2 };
    });
    const scan = await scanPayableProductOrders(fetchPage);
    expect(scan.complete).toBe(true);
    expect(scan.orders).toHaveLength(2);
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it("does not fetch past totalPages when the last page is full", async () => {
    const full = Array.from({ length: PAYABLE_PRODUCT_ORDER_PAGE_LIMIT }, () => paid);
    const fetchPage = vi.fn(async (page: number) => ({
      orders: page === 2 ? [due, ...full.slice(1)] : full,
      totalPages: 2,
    }));
    const scan = await scanPayableProductOrders(fetchPage);
    expect(scan.complete).toBe(true);
    expect(scan.orders).toHaveLength(1);
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it("stops on a short page", async () => {
    const fetchPage = vi.fn(async () => ({ orders: [due], totalPages: 5 }));
    const scan = await scanPayableProductOrders(fetchPage);
    expect(scan.complete).toBe(true);
    expect(scan.orders).toEqual([due]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it("keeps earlier rows when a later page fails", async () => {
    const full = Array.from({ length: PAYABLE_PRODUCT_ORDER_PAGE_LIMIT }, () => due);
    const fetchPage = vi.fn(async (page: number) => {
      if (page === 1) return { orders: full, totalPages: 2 };
      throw new Error("page failed");
    });
    const scan = await scanPayableProductOrders(fetchPage);
    expect(scan.complete).toBe(false);
    expect(scan.orders).toHaveLength(PAYABLE_PRODUCT_ORDER_PAGE_LIMIT);
  });
});
