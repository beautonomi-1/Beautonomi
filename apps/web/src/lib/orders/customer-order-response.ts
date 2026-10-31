/** Strip salon-only courier billing fields before customer-facing order JSON. */
export function stripCustomerProductOrderFields<T extends Record<string, unknown>>(order: T): T {
  const { courier_charged_amount: _a, courier_charged_weight_kg: _w, ...rest } = order;
  return rest as T;
}

export function stripCustomerProductOrderList<T extends Record<string, unknown>>(orders: T[]): T[] {
  return orders.map((o) => stripCustomerProductOrderFields(o));
}
