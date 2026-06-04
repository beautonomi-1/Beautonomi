/**
 * At-home (house call) service price adjustment — shared by customer web, mobile, and hold snapshots.
 */

export type AtHomeLinePricing = {
  basePrice: number;
  displayPrice: number;
  /** Amount added to base when at-home (may be negative for a discount). */
  adjustmentApplied: number;
};

/** True when the provider configured a non-zero at-home price adjustment (surcharge). */
export function hasAtHomePriceAdjustment(amount: number | null | undefined): boolean {
  return Number.isFinite(Number(amount)) && Number(amount) > 0;
}

export function catalogHasAnyAtHomePriceAdjustment(
  items: Array<{ at_home_price_adjustment?: number | null }> | null | undefined
): boolean {
  if (!items?.length) return false;
  return items.some((item) => hasAtHomePriceAdjustment(item.at_home_price_adjustment));
}

export function computeAtHomeLinePrice(
  basePrice: number,
  atHomePriceAdjustment: number | null | undefined,
  isAtHome: boolean
): AtHomeLinePricing {
  const base = Number.isFinite(Number(basePrice)) ? Number(basePrice) : 0;
  const adj = Number.isFinite(Number(atHomePriceAdjustment)) ? Number(atHomePriceAdjustment) : 0;
  if (!isAtHome) {
    return { basePrice: base, displayPrice: base, adjustmentApplied: 0 };
  }
  return {
    basePrice: base,
    displayPrice: base + adj,
    adjustmentApplied: adj,
  };
}

export type AtHomeSnapshotLine = {
  price?: number;
  base_price?: number;
  at_home_price_adjustment?: number;
};

/** Sum of positive house-call adjustments on hold snapshot lines (for summary rows). */
export function sumHouseCallAdjustmentsFromSnapshot(
  lines: AtHomeSnapshotLine[] | null | undefined
): number {
  if (!lines?.length) return 0;
  return lines.reduce((sum, line) => {
    const explicit = line.at_home_price_adjustment;
    if (explicit != null && Number.isFinite(Number(explicit))) {
      const n = Number(explicit);
      return n > 0 ? sum + n : sum;
    }
    const base = line.base_price;
    const price = line.price;
    if (base != null && price != null && Number(price) > Number(base)) {
      return sum + (Number(price) - Number(base));
    }
    return sum;
  }, 0);
}

export function lineHasHouseCallAdjustment(line: AtHomeSnapshotLine): boolean {
  if (line.at_home_price_adjustment != null && Number(line.at_home_price_adjustment) > 0) {
    return true;
  }
  if (
    line.base_price != null &&
    line.price != null &&
    Number(line.price) > Number(line.base_price)
  ) {
    return true;
  }
  return false;
}

/** Parent service carries at-home adjustment; variants use parent row when present. */
export function resolveAtHomeAdjustmentForOffering(
  offerings: Array<{
    id: string;
    parent_service_id?: string | null;
    at_home_price_adjustment?: number | null;
  }>,
  offeringId: string
): number {
  const row = offerings.find((o) => o.id === offeringId);
  if (!row) return 0;
  const parentId = row.parent_service_id;
  if (parentId) {
    const parent = offerings.find((o) => o.id === parentId);
    return Number(parent?.at_home_price_adjustment ?? 0);
  }
  return Number(row.at_home_price_adjustment ?? 0);
}

export function houseCallAdjustmentForSnapshotLine(line: AtHomeSnapshotLine): number {
  if (line.at_home_price_adjustment != null && Number.isFinite(Number(line.at_home_price_adjustment))) {
    return Math.max(0, Number(line.at_home_price_adjustment));
  }
  if (line.base_price != null && line.price != null) {
    return Math.max(0, Number(line.price) - Number(line.base_price));
  }
  return 0;
}
