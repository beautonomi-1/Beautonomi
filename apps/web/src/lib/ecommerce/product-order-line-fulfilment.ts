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

/** Forward-only transitions (plus cancel from any non-terminal state). */
export function isValidLineTransition(from: LineFulfilmentStatus, to: LineFulfilmentStatus): boolean {
  if (from === to) return true;
  if (from === "cancelled") return false;
  if (from === "delivered") return false;
  if (to === "cancelled") return true;
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

  const isCollection = params.fulfillmentType === "collection";
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
