/** Shared rules for when a customer may open another product return (UI + API alignment). */

export const PRODUCT_RETURN_WINDOW_DAYS = 14;

/** Statuses where an existing return blocks opening another for the same scope. */
export const PRODUCT_RETURN_BLOCKING_STATUSES: readonly string[] = [
  "pending",
  "approved",
  "item_received",
  "refunded",
  "escalated",
  "resolved_by_admin",
];

export function isProductReturnBlockingStatus(status: string): boolean {
  return PRODUCT_RETURN_BLOCKING_STATUSES.includes(status);
}

export function isWithinProductReturnWindow(
  deliveredAt: string | null | undefined,
  createdAt: string | null | undefined,
): boolean {
  const from = deliveredAt || createdAt;
  if (!from) return false;
  const delivered = new Date(from);
  if (!Number.isFinite(delivered.getTime())) return false;
  const days = (Date.now() - delivered.getTime()) / (1000 * 60 * 60 * 24);
  return days <= PRODUCT_RETURN_WINDOW_DAYS;
}

export interface ProductOrderReturnLike {
  status: string;
  order_item_id?: string | null;
}

export interface ProductOrderItemLike {
  id: string;
}

/** True if at least one line item can still have a new return opened (no blocking full-order or per-item return). */
export function customerHasReturnableLineItem(
  items: ProductOrderItemLike[],
  returns: ProductOrderReturnLike[] | null | undefined,
): boolean {
  const list = returns ?? [];
  return items.some((item) => {
    const blocked = list.some(
      (r) =>
        isProductReturnBlockingStatus(r.status) &&
        (r.order_item_id == null || r.order_item_id === item.id),
    );
    return !blocked;
  });
}

export function customerCanStartProductReturnRequest(params: {
  status: string;
  delivered_at: string | null | undefined;
  created_at: string | null | undefined;
  items: ProductOrderItemLike[];
  returns: ProductOrderReturnLike[] | null | undefined;
}): boolean {
  if (!["delivered", "ready_for_collection"].includes(params.status)) return false;
  if (!isWithinProductReturnWindow(params.delivered_at, params.created_at)) return false;
  return customerHasReturnableLineItem(params.items, params.returns);
}
