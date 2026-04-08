/**
 * Build POS sale line items from provider booking detail (multi-service + products).
 * Mirrors apps/web CalendarClient buildSaleItemsFromAppointment.
 */

export type BookingSaleLine = {
  item_id: string | null;
  type: "service" | "product";
  name: string;
  quantity: number;
  unit_price: number;
};

type ServiceRow = {
  offering_name?: string;
  service_name?: string;
  name?: string;
  price?: number;
  offering_id?: string;
  service_id?: string;
  id?: string;
};

type ProductRow = {
  product_name?: string;
  name?: string;
  quantity?: number;
  unit_price?: number;
  total_price?: number;
  product_id?: string;
  id?: string;
};

type BookingLike = {
  id?: string;
  package_name?: string | null;
  total_amount?: number;
  subtotal?: number;
  services?: ServiceRow[];
  products?: ProductRow[];
};

export function buildSaleItemsFromBookingDetail(b: BookingLike): BookingSaleLine[] {
  const items: BookingSaleLine[] = [];

  const services = b.services;
  if (Array.isArray(services) && services.length > 0) {
    services.forEach((s) => {
      const name = String(s.offering_name ?? s.service_name ?? s.name ?? "Service");
      const unit = Number(s.price ?? 0);
      const oid = s.offering_id ?? s.service_id ?? s.id;
      items.push({
        item_id: typeof oid === "string" ? oid : oid != null ? String(oid) : null,
        type: "service",
        name,
        quantity: 1,
        unit_price: unit,
      });
    });
  }

  const products = b.products;
  if (Array.isArray(products) && products.length > 0) {
    products.forEach((p) => {
      const name = String(p.product_name ?? p.name ?? "Product");
      const qty = Math.max(1, Number(p.quantity ?? 1));
      const unit = Number(p.unit_price ?? 0);
      const lineTotal = Number(p.total_price ?? unit * qty);
      const unitPrice = unit > 0 ? unit : lineTotal / qty;
      const pid = p.product_id ?? p.id;
      items.push({
        item_id: typeof pid === "string" ? pid : pid != null ? String(pid) : null,
        type: "product",
        name,
        quantity: qty,
        unit_price: unitPrice,
      });
    });
  }

  if (items.length === 0 && typeof b.total_amount === "number" && b.total_amount > 0) {
    const fallbackName =
      typeof b.package_name === "string" && b.package_name.trim()
        ? b.package_name.trim()
        : "Booking";
    items.push({
      item_id: null,
      type: "service",
      name: fallbackName,
      quantity: 1,
      unit_price: Number(b.subtotal ?? b.total_amount),
    });
  }

  return items;
}
