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

export type ProductOrderPayFields = ProductOrderHoldFields & {
  amount_still_due?: number | null;
};

/**
 * Customer may be offered Pay for this row. Matches the list badge:
 * an online Paystack hold with a positive server remainder.
 * Null or missing `amount_still_due` is not payable.
 */
export function customerCanPayProductOrderOnline(order: ProductOrderPayFields): boolean {
  const due = order.amount_still_due;
  return (
    isUnpaidOnlinePaystackHold(order) &&
    typeof due === "number" &&
    Number.isFinite(due) &&
    due > 0
  );
}

/** Page size used when scanning pending orders for the payment banner. */
export const PAYABLE_PRODUCT_ORDER_PAGE_LIMIT = 100;

/** Stops a scan when the API returns no count and every page is full. */
export const PAYABLE_PRODUCT_ORDER_MISSING_COUNT_PAGE_GUARD = 50;

export type PayableProductOrderPage<T> = {
  orders: T[];
  totalPages: number;
};

export type PayableProductOrderScan<T> = {
  orders: T[];
  /** False when a later page failed or the missing-count guard stopped the scan. */
  complete: boolean;
};

/**
 * Walk pending-order pages and keep rows the customer can pay.
 * Includes the last page. Stops on a short page, on `totalPages`, or after
 * {@link PAYABLE_PRODUCT_ORDER_MISSING_COUNT_PAGE_GUARD} full pages when count is missing.
 */
export async function scanPayableProductOrders<T extends ProductOrderPayFields>(
  fetchPage: (page: number) => Promise<PayableProductOrderPage<T>>,
): Promise<PayableProductOrderScan<T>> {
  const payable: T[] = [];
  let page = 1;
  while (true) {
    let result: PayableProductOrderPage<T>;
    try {
      result = await fetchPage(page);
    } catch {
      return { orders: payable, complete: false };
    }
    for (const order of result.orders) {
      if (customerCanPayProductOrderOnline(order)) payable.push(order);
    }
    const rowCount = result.orders.length;
    const totalPages = result.totalPages;
    if (rowCount < PAYABLE_PRODUCT_ORDER_PAGE_LIMIT) {
      return { orders: payable, complete: true };
    }
    if (totalPages >= 1 && page >= totalPages) {
      return { orders: payable, complete: true };
    }
    if (totalPages < 1 && page >= PAYABLE_PRODUCT_ORDER_MISSING_COUNT_PAGE_GUARD) {
      return { orders: payable, complete: false };
    }
    page += 1;
  }
}

/** Payable rows first. Relative order of the two groups stays as returned. */
export function pinPayableProductOrders<T extends ProductOrderPayFields>(orders: T[]): T[] {
  const payable: T[] = [];
  const rest: T[] = [];
  for (const order of orders) {
    if (customerCanPayProductOrderOnline(order)) payable.push(order);
    else rest.push(order);
  }
  if (payable.length === 0) return orders;
  return [...payable, ...rest];
}
