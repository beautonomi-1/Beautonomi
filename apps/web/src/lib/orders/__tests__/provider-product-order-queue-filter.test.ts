import { describe, expect, it } from "vitest";
import { isUnpaidOnlinePaystackHold } from "@beautonomi/utils";
import { PROVIDER_PRODUCT_ORDER_FULFILLMENT_OR_FILTER } from "../provider-product-order-queue-filter";

type Row = {
  order_source?: string | null;
  payment_method?: string | null;
  payment_status?: string | null;
  status?: string | null;
};

/** Mirrors the PostgREST `.or()` used for the fulfillment queue. */
function matchesFulfillmentOr(order: Row): boolean {
  const sourceNotOnline = order.order_source != null && order.order_source !== "online";
  const statusNotPending = String(order.status ?? "") !== "pending";
  const paymentNotPending = String(order.payment_status ?? "") !== "pending";
  const methodNotPaystack = order.payment_method != null && order.payment_method !== "paystack";
  return sourceNotOnline || statusNotPending || paymentNotPending || methodNotPaystack;
}

describe("provider product order fulfillment filter", () => {
  it("uses an AND branch so a non-null online source is not treated as fulfillment", () => {
    expect(PROVIDER_PRODUCT_ORDER_FULFILLMENT_OR_FILTER).toContain(
      "and(order_source.not.is.null,order_source.neq.online)",
    );
    expect(PROVIDER_PRODUCT_ORDER_FULFILLMENT_OR_FILTER.startsWith("order_source.not.is.null,")).toBe(
      false,
    );
  });

  const cases: Row[] = [
    { order_source: "online", payment_method: "paystack", payment_status: "pending", status: "pending" },
    { order_source: null, payment_method: null, payment_status: "pending", status: "pending" },
    { order_source: "online", payment_method: "cash", payment_status: "pending", status: "pending" },
    { order_source: "online", payment_method: "card_on_delivery", payment_status: "pending", status: "pending" },
    { order_source: "walk_in", payment_method: "paystack", payment_status: "pending", status: "pending" },
    { order_source: "appointment", payment_method: "paystack", payment_status: "pending", status: "pending" },
    { order_source: "online", payment_method: "paystack", payment_status: "paid", status: "confirmed" },
  ];

  it("keeps holds out of fulfillment and keeps placed rows in", () => {
    for (const row of cases) {
      expect(matchesFulfillmentOr(row)).toBe(!isUnpaidOnlinePaystackHold(row));
    }
  });
});
