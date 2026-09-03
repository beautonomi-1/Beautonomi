/**
 * Catalogue `products` + `product_variants` — consistent qty and retail stock value.
 * Parent `retail_price` is often 0 when has_variants; prices live on variants.
 */

export type ProductVariantQtyPrice = {
  quantity?: unknown;
  retail_price?: unknown;
  supply_price?: unknown;
};

export type ProductInventoryRow = {
  quantity?: unknown;
  retail_price?: unknown;
  supply_price?: unknown;
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

/**
 * Cost (COGS) value of on-hand stock: Σ qty × supply_price per SKU.
 * Variant rows fall back to the parent `supply_price` when their own is null/0,
 * since many catalogues only capture cost at the product level.
 * When track_stock_quantity is false, treated as no valued inventory.
 */
export function costStockValue(p: ProductInventoryRow): number {
  if (p.track_stock_quantity === false) return 0;
  const parentSupply = Number(p.supply_price) || 0;
  const variants = p.product_variants;
  const hasV = Boolean(p.has_variants && Array.isArray(variants) && variants.length > 0);
  if (hasV) {
    return variants!.reduce((sum, v) => {
      const supply = Number(v.supply_price) || parentSupply;
      return sum + (Number(v.quantity) || 0) * supply;
    }, 0);
  }
  return (Number(p.quantity) || 0) * parentSupply;
}

export type InventoryValuation = {
  /** Σ qty × supply_price — the balance-sheet inventory value. */
  cost_stock_value: number;
  /** Σ qty × retail_price — potential sell-through revenue (not an asset value). */
  retail_stock_value: number;
  /** retail − cost: unrealised gross margin sitting in stock. */
  potential_gross_margin: number;
};

/** Both valuations for a set of catalogue rows. */
export function valueInventory(rows: ProductInventoryRow[]): InventoryValuation {
  let cost = 0;
  let retail = 0;
  for (const p of rows) {
    cost += costStockValue(p);
    retail += retailStockValue(p);
  }
  cost = Math.round(cost * 100) / 100;
  retail = Math.round(retail * 100) / 100;
  return {
    cost_stock_value: cost,
    retail_stock_value: retail,
    potential_gross_margin: Math.round((retail - cost) * 100) / 100,
  };
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
