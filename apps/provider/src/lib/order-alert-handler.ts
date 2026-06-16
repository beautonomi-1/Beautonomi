export interface OrderAlertRow {
  id: string;
  order_number?: string | null;
  status?: string | null;
  payment_status?: string | null;
  order_source?: string | null;
  customer_name?: string | null;
}

export type OrderAlertEventKind = "insert" | "update";

function norm(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function isExcludedSource(source: string): boolean {
  return source === "walk_in" || source === "appointment";
}

function isPaidTransition(
  event: OrderAlertEventKind,
  row: OrderAlertRow,
  oldRow?: OrderAlertRow | null,
): boolean {
  const payment = norm(row.payment_status);
  const status = norm(row.status);
  if (event === "insert") {
    return payment === "paid" || status === "confirmed";
  }
  const oldPayment = norm(oldRow?.payment_status);
  return oldPayment !== "paid" && payment === "paid";
}

export function shouldAlertForOrder(
  event: OrderAlertEventKind,
  row: OrderAlertRow,
  oldRow?: OrderAlertRow | null,
): boolean {
  if (!row.id?.trim()) return false;
  if (isExcludedSource(norm(row.order_source))) return false;
  return isPaidTransition(event, row, oldRow);
}

export function handleOrderAlertRow(
  event: OrderAlertEventKind,
  row: OrderAlertRow,
  seenOrderIds: Set<string>,
  appStateActive: boolean,
  dispatch: (row: OrderAlertRow) => void,
  pendingWhenInactive: OrderAlertRow[],
  oldRow?: OrderAlertRow | null,
): void {
  if (!shouldAlertForOrder(event, row, oldRow)) return;
  if (seenOrderIds.has(row.id)) return;

  if (!appStateActive) {
    pendingWhenInactive.push(row);
    return;
  }

  seenOrderIds.add(row.id);
  dispatch(row);
}

export function flushPendingOrderAlerts(
  pending: OrderAlertRow[],
  seenOrderIds: Set<string>,
  dispatch: (row: OrderAlertRow) => void,
): void {
  if (pending.length === 0) return;
  const batch = pending.splice(0, pending.length);
  for (const row of batch) {
    if (seenOrderIds.has(row.id)) continue;
    seenOrderIds.add(row.id);
    dispatch(row);
  }
}
