/** Fields copied onto product_orders at online checkout for provider-facing views. */
export type DeliveryAddressSnapshot = Record<string, unknown>;

export function buildDeliveryAddressSnapshot(row: Record<string, unknown> | null): DeliveryAddressSnapshot | null {
  if (!row) return null;
  return {
    label: row.label ?? null,
    address_line1: row.address_line1 ?? null,
    address_line2: row.address_line2 ?? null,
    city: row.city ?? null,
    state: row.state ?? null,
    postal_code: row.postal_code ?? null,
    country: row.country ?? null,
    latitude: row.latitude ?? null,
    longitude: row.longitude ?? null,
    apartment_unit: row.apartment_unit ?? null,
    building_name: row.building_name ?? null,
    floor_number: row.floor_number ?? null,
    parking_instructions: row.parking_instructions ?? null,
    location_landmarks: row.location_landmarks ?? null,
  };
}

export function productOrderDisplayCustomerName(order: {
  customer?: { full_name?: string | null } | null;
  customer_name?: string | null;
}): string {
  const snap = order.customer_name?.trim();
  if (snap) return snap;
  return order.customer?.full_name?.trim() ?? "";
}

export function productOrderDisplayCustomerEmail(order: {
  customer?: { email?: string | null } | null;
  customer_email?: string | null;
}): string {
  const snap = order.customer_email?.trim();
  if (snap) return snap;
  return order.customer?.email?.trim() ?? "";
}

export function productOrderDisplayCustomerPhone(order: {
  customer?: { phone?: string | null } | null;
  customer_phone?: string | null;
}): string {
  const snap = order.customer_phone?.trim();
  if (snap) return snap;
  return order.customer?.phone?.trim() ?? "";
}
