/** Collection and in-store pickup share one fulfilment path. */
export function isCollectionFulfillment(type: string | null | undefined): boolean {
  const ft = String(type ?? "").toLowerCase();
  return ft === "collection" || ft === "pickup";
}

export function isDeliveryFulfillment(type: string | null | undefined): boolean {
  return String(type ?? "").toLowerCase() === "delivery";
}

export function isTerminalProductOrderStatus(status: string | null | undefined): boolean {
  const s = String(status ?? "").toLowerCase();
  return s === "delivered" || s === "cancelled" || s === "refunded";
}

export function isOpenProductOrderStatus(status: string | null | undefined): boolean {
  return !isTerminalProductOrderStatus(status);
}

export function countOpenAppointmentProductOrders(
  orders: Array<{ status?: string | null }> | null | undefined,
): number {
  return (orders ?? []).filter((o) => isOpenProductOrderStatus(o.status)).length;
}