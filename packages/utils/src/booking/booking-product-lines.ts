import { multiplyMoney } from "../money";

export type BookingProductLine = {
  id: string;
  name: string;
  variantLabel: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
};

export type BookingAddonLine = {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function num(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function variantText(row: Record<string, unknown>): string {
  const direct = firstString(
    row.product_variant_name,
    row.productVariantName,
    row.variant_name,
    row.variantName,
  );
  if (direct) return direct.replace(/^·\s*/, "");
  const variant = asRecord(row.product_variant) ?? asRecord(row.productVariant);
  const ov = variant?.option_values ?? variant?.optionValues ?? row.option_values ?? row.optionValues;
  if (!ov || typeof ov !== "object" || Array.isArray(ov)) return "";
  return Object.values(ov as Record<string, unknown>)
    .map((value) => (value == null ? "" : String(value).trim()))
    .filter(Boolean)
    .join(" / ");
}

function splitNameAndVariant(row: Record<string, unknown>): { name: string; variantLabel: string } {
  const nested = asRecord(row.products) ?? asRecord(row.product);
  let name =
    firstString(row.product_name, row.productName, row.name, nested?.name, nested?.title) || "Product";
  let variantLabel = variantText(row);
  if (variantLabel) {
    const suffix = ` · ${variantLabel}`;
    if (name.endsWith(suffix)) name = name.slice(0, -suffix.length).trim();
  }
  return { name: name || "Product", variantLabel };
}

export function bookingProductLineLabel(line: Pick<BookingProductLine, "name" | "variantLabel" | "quantity">): string {
  const named = line.variantLabel ? `${line.name} · ${line.variantLabel}` : line.name;
  return line.quantity > 1 ? `${named} ×${line.quantity}` : named;
}

export function bookingAddonLineLabel(line: Pick<BookingAddonLine, "name" | "quantity">): string {
  return line.quantity > 1 ? `${line.name} ×${line.quantity}` : line.name;
}

export function bookingProductLineFromUnknown(row: unknown, index: number): BookingProductLine | null {
  const rec = asRecord(row);
  if (!rec) return null;
  const { name, variantLabel } = splitNameAndVariant(rec);
  const quantity = Math.max(1, num(rec.quantity ?? rec.qty, 1));
  const nested = asRecord(rec.products) ?? asRecord(rec.product);
  const unitPrice = num(
    rec.unit_price ?? rec.unitPrice ?? rec.price ?? nested?.retail_price ?? nested?.price,
    0,
  );
  const totalPrice = num(
    rec.total_price ?? rec.totalPrice ?? rec.total,
    multiplyMoney(unitPrice, quantity),
  );
  return {
    id: firstString(rec.id, rec.product_id, rec.productId) || `product-${index}`,
    name,
    variantLabel,
    quantity,
    unitPrice,
    totalPrice,
  };
}

function productArrays(source: Record<string, unknown>): unknown[][] {
  const group = asRecord(source.group_bookings) ?? asRecord(source.group_booking) ?? asRecord(source.group);
  return [
    asArray(source.products),
    asArray(source.booking_products),
    asArray(source.group_products),
    asArray(source.groupProducts),
    asArray(group?.products),
  ];
}

/**
 * Product rows from a booking payload. Uses the first non-empty source so a
 * mapped `products` list is not repeated from the raw `booking_products` embed
 * or a group JSON copy of the same lines.
 */
export function collectBookingProductLines(source: unknown): BookingProductLine[] {
  if (Array.isArray(source)) {
    return source
      .map(bookingProductLineFromUnknown)
      .filter((line): line is BookingProductLine => line != null);
  }
  const rec = asRecord(source);
  if (!rec) return [];
  const rows = productArrays(rec).find((list) => list.length > 0) ?? [];
  return rows
    .map(bookingProductLineFromUnknown)
    .filter((line): line is BookingProductLine => line != null);
}

export function bookingAddonLineFromUnknown(row: unknown, index: number): BookingAddonLine | null {
  const rec = asRecord(row);
  if (!rec) return null;
  const nested = asRecord(rec.offerings) ?? asRecord(rec.offering) ?? asRecord(rec.addon);
  const name =
    firstString(rec.addon_name, rec.offering_name, rec.title, rec.name, nested?.title, nested?.name) ||
    "Add-on";
  const quantity = Math.max(1, num(rec.quantity ?? rec.qty, 1));
  const unitPrice = num(rec.unit_price ?? rec.unitPrice ?? rec.price, 0);
  const totalPrice = num(rec.total_price ?? rec.totalPrice ?? rec.total, multiplyMoney(unitPrice, quantity));
  return {
    id: firstString(rec.id, rec.addon_id) || `addon-${index}`,
    name,
    quantity,
    unitPrice,
    totalPrice,
  };
}

export function collectBookingAddonLines(source: unknown): BookingAddonLine[] {
  const rec = asRecord(source);
  if (!rec) return [];
  const rows = asArray(rec.addons).length > 0 ? asArray(rec.addons) : asArray(rec.booking_addons);
  return rows
    .map(bookingAddonLineFromUnknown)
    .filter((line): line is BookingAddonLine => line != null);
}
