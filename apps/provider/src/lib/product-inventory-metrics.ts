/**
 * Mirrors `apps/web/src/lib/provider-portal/product-inventory-metrics.ts`
 * for consistent list pricing and stock on the provider app.
 */

export type ProductVariantQtyPrice = {
  quantity?: unknown;
  retail_price?: unknown;
};

export type ProductInventoryRow = {
  quantity?: unknown;
  retail_price?: unknown;
  has_variants?: boolean | null;
  track_stock_quantity?: boolean | null;
  low_stock_level?: unknown;
  variants?: ProductVariantQtyPrice[] | null;
};

export function aggregateVariantQuantity(variants: ProductVariantQtyPrice[] | null | undefined): number {
  if (!Array.isArray(variants) || variants.length === 0) return 0;
  return variants.reduce((s, v) => s + (Number(v.quantity) || 0), 0);
}

export function effectiveStockQuantity(p: ProductInventoryRow): number {
  const variants = p.variants;
  const hasV = Boolean(p.has_variants && Array.isArray(variants) && variants.length > 0);
  if (hasV) return aggregateVariantQuantity(variants);
  return Number(p.quantity) || 0;
}

export function displayRetailPriceMin(p: ProductInventoryRow): number {
  const variants = p.variants;
  const hasV = Boolean(p.has_variants && Array.isArray(variants) && variants.length > 0);
  if (hasV) {
    const prices = variants!.map((v) => Number(v.retail_price) || 0);
    const positive = prices.filter((x) => x > 0);
    if (positive.length === 0) return 0;
    return Math.min(...positive);
  }
  return Number(p.retail_price) || 0;
}
