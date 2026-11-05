/**
 * PostgREST filters for online Paystack checkout holds vs fulfillment queue.
 * Must stay aligned with `isUnpaidOnlinePaystackHold` in @beautonomi/utils.
 */

/**
 * Rows that are NOT unpaid online Paystack holds (fulfillment queue).
 * Source must be both non-null AND not online in one AND-branch. A bare
 * `order_source.not.is.null` would match online holds and put them in fulfillment.
 */
export const PROVIDER_PRODUCT_ORDER_FULFILLMENT_OR_FILTER =
  "and(order_source.not.is.null,order_source.neq.online),status.neq.pending,payment_status.neq.pending,and(payment_method.not.is.null,payment_method.neq.paystack)";

export type ProviderProductOrderQueue = "fulfillment" | "awaiting_payment";

export function applyProviderProductOrderQueueFilter<
  T extends {
    or: (filter: string) => T;
    eq: (column: string, value: string) => T;
  },
>(
  query: T,
  queue: ProviderProductOrderQueue,
): T {
  if (queue === "awaiting_payment") {
    return query
      .eq("status", "pending")
      .eq("payment_status", "pending")
      .or(
        "and(or(order_source.eq.online,order_source.is.null),or(payment_method.eq.paystack,payment_method.is.null))",
      );
  }
  return query.or(PROVIDER_PRODUCT_ORDER_FULFILLMENT_OR_FILTER);
}
