import { computeAtHomeLinePrice } from "@beautonomi/utils";

export type LegacyServiceCatalogRow = {
  id: string;
  price: number;
  at_home_price_adjustment?: number | null;
};

export type LegacySelectedServiceLine = {
  id: string;
  title: string;
  duration: number;
  bufferMinutes?: number;
  price: number;
  currency: string;
  staffId?: string;
  staffName?: string;
  baseServiceId?: string;
  base_price?: number;
  at_home_price_adjustment?: number;
};

export function resolveLegacyParentAdjustment(
  sel: Pick<LegacySelectedServiceLine, "id" | "baseServiceId">,
  catalog: LegacyServiceCatalogRow[]
): number {
  const parentId = sel.baseServiceId ?? sel.id;
  const parent = catalog.find((c) => c.id === parentId);
  return Number(parent?.at_home_price_adjustment ?? 0);
}

export function legacyCatalogBasePrice(
  sel: LegacySelectedServiceLine,
  catalog: LegacyServiceCatalogRow[]
): number {
  if (sel.base_price != null && Number.isFinite(sel.base_price)) {
    return sel.base_price;
  }
  const row = catalog.find((c) => c.id === sel.id);
  if (row) return row.price;
  if (sel.baseServiceId) {
    const parent = catalog.find((c) => c.id === sel.baseServiceId);
    if (parent && sel.id === sel.baseServiceId) return parent.price;
  }
  const adj = resolveLegacyParentAdjustment(sel, catalog);
  if (sel.at_home_price_adjustment != null && Number(sel.at_home_price_adjustment) > 0) {
    return Math.max(0, Number(sel.price) - Number(sel.at_home_price_adjustment));
  }
  if (adj > 0 && Number(sel.price) > adj) {
    return Number(sel.price) - adj;
  }
  return Number(sel.price);
}

export function applyLegacyAtHomeToSelectedLine(
  line: LegacySelectedServiceLine,
  catalogBasePrice: number,
  atHomeAdjustment: number,
  isAtHome: boolean
): LegacySelectedServiceLine {
  const priced = computeAtHomeLinePrice(catalogBasePrice, atHomeAdjustment, isAtHome);
  return {
    ...line,
    price: priced.displayPrice,
    base_price: priced.basePrice,
    at_home_price_adjustment: priced.adjustmentApplied,
  };
}

export function repriceLegacySelectedServices(
  selected: LegacySelectedServiceLine[],
  catalog: LegacyServiceCatalogRow[],
  isAtHome: boolean
): LegacySelectedServiceLine[] {
  return selected.map((sel) => {
    const catalogBasePrice = legacyCatalogBasePrice(sel, catalog);
    const adj = resolveLegacyParentAdjustment(sel, catalog);
    return applyLegacyAtHomeToSelectedLine(sel, catalogBasePrice, adj, isAtHome);
  });
}
