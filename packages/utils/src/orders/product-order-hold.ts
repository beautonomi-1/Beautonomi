export type ProductOrderHoldFields = {
  order_source?: string | null;
  payment_method?: string | null;
  payment_status?: string | null;
  status?: string | null;
};

/** Unpaid online Paystack checkout: stock held, not a provider fulfillment order yet. */
export function isUnpaidOnlinePaystackHold(order: ProductOrderHoldFields): boolean {
  const source = String(order.order_source ?? "online").trim().toLowerCase();
  const method = String(order.payment_method ?? "paystack").trim().toLowerCase();
  return (
    source === "online" &&
    method === "paystack" &&
    String(order.payment_status ?? "").toLowerCase() === "pending" &&
    String(order.status ?? "").toLowerCase() === "pending"
  );
}

/** Placed order eligible for fulfillment queue (not an online Paystack hold). */
export function isProductOrderFulfillmentQueueRow(order: ProductOrderHoldFields): boolean {
  return !isUnpaidOnlinePaystackHold(order);
}
