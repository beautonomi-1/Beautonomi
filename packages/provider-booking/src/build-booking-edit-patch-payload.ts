import { calculateBookingTotals, safeNum } from "@beautonomi/utils";
import type {
  BookingEditCatalogService,
  BookingEditPatchPayload,
  BookingEditProductLine,
  BookingEditServiceLine,
  BookingEditTotalsInput,
} from "./booking-edit-types";

function resolveServiceLineFields(
  sel: BookingEditServiceLine,
  catalogServices: BookingEditCatalogService[],
): { title: string; price: number; durationMinutes: number } {
  const svc = catalogServices.find((s) => s.id === sel.serviceId);
  const addonPrice = (sel.addOnIds ?? []).reduce((acc, aoId) => {
    const ao = svc?.add_ons?.find((a) => a.id === aoId);
    return acc + safeNum(ao?.price);
  }, 0);
  const addonMinutes = (sel.addOnIds ?? []).reduce((acc, aoId) => {
    const ao = svc?.add_ons?.find((a) => a.id === aoId);
    return acc + safeNum(ao?.duration_minutes);
  }, 0);

  const title = svc?.title ?? sel.offeringName ?? "Service";
  const basePrice = svc ? safeNum(svc.price) : safeNum(sel.price);
  const baseMinutes = svc ? safeNum(svc.duration_minutes) : safeNum(sel.durationMinutes);

  return {
    title,
    price: basePrice + addonPrice,
    durationMinutes: baseMinutes + addonMinutes,
  };
}

export function computeBookingEditLineSubtotal(
  selectedServices: BookingEditServiceLine[],
  selectedProducts: BookingEditProductLine[],
  catalogServices: BookingEditCatalogService[],
): { subtotal: number; totalMinutes: number } {
  let subtotal = 0;
  let totalMinutes = 0;

  for (const sel of selectedServices) {
    const line = resolveServiceLineFields(sel, catalogServices);
    subtotal += line.price;
    totalMinutes += line.durationMinutes;
  }

  for (const p of selectedProducts) {
    const qty = Math.max(1, Math.floor(safeNum(p.quantity)) || 1);
    subtotal += safeNum(p.unitPrice) * qty;
  }

  return { subtotal, totalMinutes };
}

export function computeBookingEditTotals(input: BookingEditTotalsInput) {
  const discountAmount = safeNum(input.manualDiscount) + safeNum(input.preservedDiscountTotal);
  const pricing = calculateBookingTotals({
    subtotal: safeNum(input.subtotal),
    discountAmount,
    taxRate: safeNum(input.taxRate),
    taxInclusive: input.taxInclusive,
    travelFee: safeNum(input.travelFee),
    serviceFeePercentage: 0,
    tipAmount: safeNum(input.tipAmount),
  });

  return {
    subtotal: safeNum(input.subtotal),
    discountAmount,
    taxAmount: safeNum(pricing.taxAmount),
    totalAmount: safeNum(pricing.totalAmount) + safeNum(input.serviceFeeAmount),
  };
}

export function buildBookingEditPatchPayload(args: {
  selectedServices: BookingEditServiceLine[];
  selectedProducts: BookingEditProductLine[];
  catalogServices: BookingEditCatalogService[];
  scheduledAt?: string | null;
  notes?: string;
  manualDiscount: number;
  preservedDiscountTotal: number;
  taxRate: number;
  taxInclusive: boolean;
  travelFee: number;
  tipAmount: number;
  serviceFeeAmount: number;
  discountReason?: string | null;
  version?: number;
}): BookingEditPatchPayload {
  const { subtotal } = computeBookingEditLineSubtotal(
    args.selectedServices,
    args.selectedProducts,
    args.catalogServices,
  );

  const totals = computeBookingEditTotals({
    subtotal,
    manualDiscount: args.manualDiscount,
    preservedDiscountTotal: args.preservedDiscountTotal,
    taxRate: args.taxRate,
    taxInclusive: args.taxInclusive,
    travelFee: args.travelFee,
    tipAmount: args.tipAmount,
    serviceFeeAmount: args.serviceFeeAmount,
  });

  const baseScheduledAt = args.scheduledAt ?? undefined;
  let cursorMs = baseScheduledAt ? new Date(baseScheduledAt).getTime() : Date.now();

  const services = args.selectedServices.map((sel) => {
    const line = resolveServiceLineFields(sel, args.catalogServices);
    const duration = line.durationMinutes;
    const scheduled_start_at = baseScheduledAt
      ? new Date(cursorMs).toISOString()
      : undefined;
    cursorMs += duration * 60 * 1000;

    return {
      serviceId: sel.serviceId,
      offering_id: sel.serviceId,
      staff_id: sel.staffId,
      price: line.price,
      duration,
      ...(scheduled_start_at ? { scheduled_start_at } : {}),
    };
  });

  const primaryStaffId =
    args.selectedServices.find((s) => s.staffId)?.staffId ?? undefined;

  const products = args.selectedProducts.map((p) => {
    const qty = Math.max(1, Math.floor(safeNum(p.quantity)) || 1);
    const unit = safeNum(p.unitPrice);
    return {
      productId: p.productId,
      quantity: qty,
      unitPrice: unit,
      totalPrice: unit * qty,
      productVariantId: p.productVariantId ?? null,
    };
  });

  return {
    services,
    products,
    ...(primaryStaffId ? { staff_id: primaryStaffId } : {}),
    ...(args.notes !== undefined ? { special_requests: args.notes } : {}),
    subtotal: totals.subtotal,
    discount_amount: safeNum(args.manualDiscount),
    ...(args.discountReason ? { discount_reason: args.discountReason } : {}),
    tax_amount: totals.taxAmount,
    tax_rate: args.taxRate,
    total_amount: totals.totalAmount,
    ...(args.version !== undefined ? { version: args.version } : {}),
  };
}

export function mapBookingDetailToEditLines(booking: {
  services?: Array<{
    offering_id?: string;
    service_id?: string;
    staff_id?: string | null;
    offering_name?: string;
    price?: number;
    duration_minutes?: number;
  }>;
  products?: Array<{
    product_id?: string;
    product_name?: string;
    product_variant_id?: string | null;
    product_variant?: { option_values?: unknown } | null;
    quantity?: number;
    unit_price?: number;
  }>;
}): {
  services: BookingEditServiceLine[];
  products: BookingEditProductLine[];
} {
  const services = (booking.services ?? [])
    .map((s): BookingEditServiceLine | null => {
      const serviceId = s.offering_id ?? s.service_id;
      if (!serviceId) return null;
      const line: BookingEditServiceLine = { serviceId, addOnIds: [] };
      if (s.staff_id) line.staffId = s.staff_id;
      if (s.offering_name) line.offeringName = s.offering_name;
      if (s.price != null) line.price = Number(s.price);
      if (s.duration_minutes != null) line.durationMinutes = Number(s.duration_minutes);
      return line;
    })
    .filter((s): s is BookingEditServiceLine => s !== null);

  const products = (booking.products ?? [])
    .map((p): BookingEditProductLine | null => {
      if (!p.product_id) return null;
      const variantValues = p.product_variant?.option_values;
      const variantName =
        variantValues && typeof variantValues === "object"
          ? Object.values(variantValues as Record<string, string>).join(" / ")
          : undefined;
      const line: BookingEditProductLine = {
        productId: p.product_id,
        productName: p.product_name ?? "Product",
        quantity: Math.max(1, Number(p.quantity ?? 1)),
        unitPrice: Number(p.unit_price ?? 0),
      };
      if (p.product_variant_id) line.productVariantId = p.product_variant_id;
      if (variantName) line.productVariantName = variantName;
      return line;
    })
    .filter((p): p is BookingEditProductLine => p !== null);

  return { services, products };
}

export function resolveBookingEditServiceLabel(
  sel: BookingEditServiceLine,
  catalogServices: BookingEditCatalogService[],
): string {
  return resolveServiceLineFields(sel, catalogServices).title;
}

export function resolveBookingEditServiceDisplay(
  sel: BookingEditServiceLine,
  catalogServices: BookingEditCatalogService[],
): { title: string; durationMinutes: number; price: number; currency?: string } {
  const svc = catalogServices.find((s) => s.id === sel.serviceId);
  const line = resolveServiceLineFields(sel, catalogServices);
  return {
    title: line.title,
    durationMinutes: line.durationMinutes,
    price: line.price,
    currency: svc?.currency,
  };
}
