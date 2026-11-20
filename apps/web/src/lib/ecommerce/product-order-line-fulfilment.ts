/**
 * Line-level fulfilment for product orders (migration 879).
 *
 * `product_order_items.fulfilment_status`: pending → packed → shipped → delivered | cancelled
 * The order-level `status` is derived from the lines so partial shipments are visible
 * to the customer and the "all delivered → delivered" transition is automatic.
 */

export const LINE_FULFILMENT_STATUSES = ["pending", "packed", "shipped", "delivered", "cancelled"] as const;
export type LineFulfilmentStatus = (typeof LINE_FULFILMENT_STATUSES)[number];

const RANK: Record<LineFulfilmentStatus, number> = {
  pending: 0,
  packed: 1,
  shipped: 2,
  delivered: 3,
  cancelled: -1,
};

export type FulfilmentLine = {
  id: string;
  quantity: number;
  fulfilment_status?: string | null;
  fulfilled_qty?: number | null;
};

export type LineFulfilmentSummary = {
  total: number;
  active: number;
  pending: number;
  packed: number;
  shipped: number;
  delivered: number;
  cancelled: number;
  /** shipped + delivered */
  dispatched: number;
};

export function normalizeLineStatus(raw: string | null | undefined): LineFulfilmentStatus {
  const s = String(raw ?? "pending");
  return (LINE_FULFILMENT_STATUSES as readonly string[]).includes(s) ? (s as LineFulfilmentStatus) : "pending";
}

import { isCollectionFulfillment as isCollectionFulfillmentShared } from "@beautonomi/utils";

/** Collection and in-store pickup share one path. Delivery uses the courier path. */
export function isCollectionFulfillment(type: string | null | undefined): boolean {
  return isCollectionFulfillmentShared(type);
}

/**
 * `shipped` is the delivery dispatch status. `ready_for_collection` is the
 * collection equivalent. Every other order status is shared.
 */
export function productOrderStatusFitsFulfillment(
  status: string,
  fulfillmentType: string | null | undefined,
): boolean {
  const collection = isCollectionFulfillment(fulfillmentType);
  if (status === "shipped") return !collection;
  if (status === "ready_for_collection") return collection;
  return true;
}

export function filterProductOrderStatusActions<T extends { next: string }>(
  actions: T[],
  fulfillmentType: string | null | undefined,
): T[] {
  return actions.filter((action) => productOrderStatusFitsFulfillment(action.next, fulfillmentType));
}

/** Line status written when the whole order is marked at this fulfilment step. */
export function lineStatusForOrderStatus(orderStatus: string): LineFulfilmentStatus | null {
  if (orderStatus === "ready_for_collection") return "packed";
  if (orderStatus === "shipped") return "shipped";
  if (orderStatus === "delivered") return "delivered";
  return null;
}

/** Line statuses that move forward with that order status. Delivered lines stay delivered. */
export function lineStatusesAdvancedByOrderStatus(orderStatus: string): LineFulfilmentStatus[] | null {
  if (orderStatus === "ready_for_collection") return ["pending"];
  if (orderStatus === "shipped") return ["pending", "packed"];
  if (orderStatus === "delivered") return ["pending", "packed", "shipped"];
  return null;
}

/**
 * Keep line fulfilment in step with an order-level status change.
 * Courier sync and the provider "mark shipped / ready / collected" actions
 * both go through this so the customer line labels match the order.
 */
export async function syncProductOrderLinesToOrderStatus(
  supabase: { from: (table: string) => any },
  orderId: string,
  orderStatus: string,
): Promise<void> {
  const next = lineStatusForOrderStatus(orderStatus);
  const fromStatuses = lineStatusesAdvancedByOrderStatus(orderStatus);
  if (!next || !fromStatuses) return;

  const { data, error } = await supabase
    .from("product_order_items")
    .select("id, quantity, fulfilment_status")
    .eq("order_id", orderId);
  if (error || !data) return;

  const now = new Date().toISOString();
  const advance = new Set<string>(fromStatuses);
  for (const line of data) {
    const from = normalizeLineStatus(line.fulfilment_status);
    if (!advance.has(from)) continue;
    const patch: Record<string, unknown> = {
      fulfilment_status: next,
      fulfilment_updated_at: now,
    };
    if (next === "shipped" || next === "delivered") {
      patch.fulfilled_qty = Math.max(0, Number(line.quantity) || 0);
    }
    await supabase.from("product_order_items").update(patch).eq("id", line.id);
  }
}

/** Forward-only transitions (plus cancel from any non-terminal state). */
export function isValidLineTransition(
  from: LineFulfilmentStatus,
  to: LineFulfilmentStatus,
  fulfillmentType?: string | null,
): boolean {
  if (from === to) return true;
  if (from === "cancelled") return false;
  if (from === "delivered") return false;
  if (to === "cancelled") return true;
  // Collection orders are picked up. "Shipped" is the courier status.
  if (to === "shipped" && isCollectionFulfillment(fulfillmentType)) return false;
  return RANK[to] > RANK[from];
}

export function summarizeLineFulfilment(lines: FulfilmentLine[]): LineFulfilmentSummary {
  const s: LineFulfilmentSummary = {
    total: lines.length,
    active: 0,
    pending: 0,
    packed: 0,
    shipped: 0,
    delivered: 0,
    cancelled: 0,
    dispatched: 0,
  };
  for (const line of lines) {
    const st = normalizeLineStatus(line.fulfilment_status);
    s[st] += 1;
    if (st !== "cancelled") s.active += 1;
  }
  s.dispatched = s.shipped + s.delivered;
  return s;
}

const ORDER_TERMINAL = new Set(["cancelled", "refunded"]);
const ORDER_RANK: Record<string, number> = {
  pending: 0,
  confirmed: 1,
  processing: 2,
  ready_for_collection: 3,
  shipped: 3,
  delivered: 4,
};

/**
 * Derive the order-level status from its lines. Returns `null` when the order status
 * should not change (terminal orders, no active lines, or the lines don't move it forward).
 */
export function deriveOrderStatusFromLines(params: {
  lines: FulfilmentLine[];
  currentStatus: string;
  fulfillmentType: "collection" | "delivery" | string | null | undefined;
}): string | null {
  const { lines, currentStatus } = params;
  if (ORDER_TERMINAL.has(currentStatus)) return null;
  const s = summarizeLineFulfilment(lines);
  if (s.active === 0) return null;

  const isCollection = isCollectionFulfillment(params.fulfillmentType);
  let derived: string | null = null;
  if (s.delivered === s.active) {
    derived = "delivered";
  } else if (s.dispatched === s.active) {
    derived = isCollection ? "ready_for_collection" : "shipped";
  } else if (s.packed + s.dispatched === s.active) {
    derived = isCollection ? "ready_for_collection" : "processing";
  } else if (s.dispatched > 0 || s.packed > 0) {
    derived = "processing";
  }
  if (!derived) return null;
  // Never move the order backwards from a status the provider already set.
  if ((ORDER_RANK[derived] ?? 0) <= (ORDER_RANK[currentStatus] ?? 0)) return null;
  return derived;
}

/** Fire the one-time "partially shipped" customer notice when some, not all, lines have left. */
export function shouldNotifyPartiallyShipped(params: {
  summary: LineFulfilmentSummary;
  partiallyShippedNotifiedAt: string | null | undefined;
}): boolean {
  const { summary, partiallyShippedNotifiedAt } = params;
  if (partiallyShippedNotifiedAt) return false;
  return summary.dispatched > 0 && summary.dispatched < summary.active;
}
