/**
 * Catalogue `products` + `product_variants` — consistent qty and retail stock value.
 * Parent `retail_price` is often 0 when has_variants; prices live on variants.
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
  product_variants?: ProductVariantQtyPrice[] | null;
};

export function aggregateVariantQuantity(variants: ProductVariantQtyPrice[] | null | undefined): number {
  if (!Array.isArray(variants) || variants.length === 0) return 0;
  return variants.reduce((s, v) => s + (Number(v.quantity) || 0), 0);
}

/** In-stock units: variant sum when has_variants, else product.quantity */
export function effectiveStockQuantity(p: ProductInventoryRow): number {
  const variants = p.product_variants;
  const hasV = Boolean(p.has_variants && Array.isArray(variants) && variants.length > 0);
  if (hasV) return aggregateVariantQuantity(variants);
  return Number(p.quantity) || 0;
}

/**
 * Retail value of on-hand stock (Σ qty × retail per SKU).
 * When track_stock_quantity is false, treated as no valued inventory.
 */
export function retailStockValue(p: ProductInventoryRow): number {
  if (p.track_stock_quantity === false) return 0;
  const variants = p.product_variants;
  const hasV = Boolean(p.has_variants && Array.isArray(variants) && variants.length > 0);
  if (hasV) {
    return variants!.reduce(
      (sum, v) => sum + (Number(v.quantity) || 0) * (Number(v.retail_price) || 0),
      0,
    );
  }
  return (Number(p.quantity) || 0) * (Number(p.retail_price) || 0);
}

/** Listed retail: lowest variant price when variants exist, else parent retail */
export function displayRetailPriceMin(p: ProductInventoryRow): number {
  const variants = p.product_variants;
  const hasV = Boolean(p.has_variants && Array.isArray(variants) && variants.length > 0);
  if (hasV) {
    const prices = variants!.map((v) => Number(v.retail_price) || 0);
    const positive = prices.filter((x) => x > 0);
    if (positive.length === 0) return 0;
    return Math.min(...positive);
  }
  return Number(p.retail_price) || 0;
}
