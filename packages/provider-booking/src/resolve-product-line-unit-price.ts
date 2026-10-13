export type ProductCatalogLine = {
  retail_price?: number | null;
  has_variants?: boolean | null;
  variants?: Array<{ id: string; retail_price?: number | null }> | null;
};

export function productCartLineKey(productId: string, variantId?: string | null): string {
  return `${productId}:${variantId ?? ""}`;
}

export function resolveProductLineUnitPrice(
  product: ProductCatalogLine,
  variantId?: string | null,
): number {
  const productPrice = Number(product.retail_price ?? 0) || 0;
  if (variantId && product.variants?.length) {
    const variant = product.variants.find((v) => v.id === variantId);
    if (variant) {
      const variantPrice = Number(variant.retail_price);
      return Number.isFinite(variantPrice) && variantPrice > 0 ? variantPrice : productPrice;
    }
  }
  return productPrice;
}

export function stockLimitForCatalogProduct(
  product: { track_stock_quantity?: boolean | null; quantity?: number | null },
  variant?: { quantity?: number | null } | null,
): number | null {
  if (product.track_stock_quantity === false) return null;
  const raw = variant ? variant.quantity : product.quantity;
  const stock = Number(raw ?? 0);
  return Number.isFinite(stock) ? Math.max(0, Math.floor(stock)) : 0;
}
