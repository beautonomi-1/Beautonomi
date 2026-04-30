export type DeliveryFeeType = "flat" | "weight_based" | "distance_based";

export type DeliveryFeeConfig = {
  delivery_fee?: number | string | null;
  delivery_fee_type?: DeliveryFeeType | string | null;
  free_delivery_threshold?: number | string | null;
  weight_rate_per_kg?: number | string | null;
  distance_rate_per_km?: number | string | null;
};

export type DeliveryFeeItem = {
  quantity?: number | string | null;
  weight_grams?: number | string | null;
};

export function calculateProductDeliveryFee(params: {
  subtotal: number;
  config?: DeliveryFeeConfig | null;
  items?: DeliveryFeeItem[];
  distanceKm?: number | null;
}): { fee: number; feeType: DeliveryFeeType; totalWeightKg: number; distanceKm: number | null } {
  const { subtotal, config, items = [], distanceKm = null } = params;
  const baseFee = money(Number(config?.delivery_fee ?? 0) || 0);
  const threshold = Number(config?.free_delivery_threshold ?? 0) || 0;
  const feeType = normalizeFeeType(config?.delivery_fee_type);

  if (threshold > 0 && subtotal >= threshold) {
    return { fee: 0, feeType, totalWeightKg: totalWeightKg(items), distanceKm };
  }

  if (feeType === "weight_based") {
    const weightKg = totalWeightKg(items);
    const rate = Number(config?.weight_rate_per_kg ?? 0) || 0;
    return { fee: money(baseFee + weightKg * rate), feeType, totalWeightKg: weightKg, distanceKm };
  }

  if (feeType === "distance_based") {
    const rate = Number(config?.distance_rate_per_km ?? 0) || 0;
    const distanceCharge = distanceKm != null && Number.isFinite(distanceKm) ? distanceKm * rate : 0;
    return { fee: money(baseFee + distanceCharge), feeType, totalWeightKg: totalWeightKg(items), distanceKm };
  }

  return { fee: baseFee, feeType: "flat", totalWeightKg: totalWeightKg(items), distanceKm };
}

export function distanceKmBetween(
  a: { latitude?: number | string | null; longitude?: number | string | null } | null | undefined,
  b: { latitude?: number | string | null; longitude?: number | string | null } | null | undefined,
): number | null {
  const lat1 = Number(a?.latitude);
  const lon1 = Number(a?.longitude);
  const lat2 = Number(b?.latitude);
  const lon2 = Number(b?.longitude);
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return null;

  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthKm = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(earthKm * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)) * 100) / 100;
}

function normalizeFeeType(value: unknown): DeliveryFeeType {
  return value === "weight_based" || value === "distance_based" ? value : "flat";
}

function totalWeightKg(items: DeliveryFeeItem[]): number {
  const grams = items.reduce((sum, item) => {
    const quantity = Math.max(1, Math.floor(Number(item.quantity ?? 1)) || 1);
    return sum + (Number(item.weight_grams ?? 0) || 0) * quantity;
  }, 0);
  return Math.round((grams / 1000) * 1000) / 1000;
}

function money(value: number): number {
  return Math.round(Math.max(0, value) * 100) / 100;
}
