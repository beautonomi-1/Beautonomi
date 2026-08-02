export interface RawServiceAddonLine {
  addonId: string;
  addonName?: string;
  price: number;
  duration: number;
}

export interface RawServiceLineInput {
  id: string;
  serviceId: string;
  serviceName: string;
  price: number;
  duration: number;
  staffId?: string;
  customization?: string;
  addons?: RawServiceAddonLine[];
}

export interface RawProductLineInput {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  productVariantId?: string | null;
  productVariantName?: string | null;
}

function sumAddonDuration(addons?: RawServiceAddonLine[]): number {
  return addons?.reduce((sum, a) => sum + Number(a.duration || 0), 0) ?? 0;
}

function sumAddonPrice(addons?: RawServiceAddonLine[]): number {
  return addons?.reduce((sum, a) => sum + Number(a.price || 0), 0) ?? 0;
}

/** Maps UI service lines to API create-booking `services[]` shape. */
export function mapCreateBookingServiceLines(
  lines: RawServiceLineInput[],
  fallbackStaffId?: string,
): Array<Record<string, unknown>> {
  return lines.map((line) => {
    const addonDuration = sumAddonDuration(line.addons);
    const addonPrice = sumAddonPrice(line.addons);
    const addOnIds = (line.addons ?? []).map((a) => a.addonId).filter(Boolean);
    const staff = line.staffId || fallbackStaffId || null;
    const durationMinutes = line.duration + addonDuration;
    return {
      serviceId: line.serviceId,
      service_id: line.serviceId,
      serviceName: line.serviceName,
      service_name: line.serviceName,
      price: line.price + addonPrice,
      duration: durationMinutes,
      duration_minutes: durationMinutes,
      staffId: staff,
      staff_id: staff,
      customization: line.customization?.trim() || null,
      add_on_ids: addOnIds.length > 0 ? addOnIds : undefined,
      addons: line.addons,
    };
  });
}

/** Maps UI product lines to API create-booking `products[]` shape. */
export function mapCreateBookingProductLines(
  lines: RawProductLineInput[],
): Array<Record<string, unknown>> {
  return lines.map((line) => ({
    productId: line.productId,
    product_id: line.productId,
    productName: line.productName,
    product_name: line.productVariantName
      ? `${line.productName} (${line.productVariantName})`
      : line.productName,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    unit_price: line.unitPrice,
    totalPrice: line.totalPrice,
    total_price: line.totalPrice,
    productVariantId: line.productVariantId ?? null,
    product_variant_id: line.productVariantId ?? null,
  }));
}

export function resolveDepositChargeAmount(
  totalAmount: number,
  collectDeposit: boolean,
  depositPercentage = 50,
): number {
  if (!collectDeposit || totalAmount <= 0) return totalAmount;
  const pct = Number.isFinite(depositPercentage) && depositPercentage > 0 ? depositPercentage : 50;
  return Math.ceil((totalAmount * pct) / 100);
}
