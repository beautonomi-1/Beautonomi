import type { ProductItem, ProductVariantRow } from "./types";
import { effectiveStockQuantity } from "@/lib/product-inventory-metrics";

export interface PosCartProductItem {
  lineId: string;
  item_id: string;
  type: "product";
  name: string;
  price: number;
  quantity: number;
  currency?: string;
  product_variant_id?: string | null;
}

export function isProductSellable(p: ProductItem): boolean {
  return p.is_active !== false && p.retail_sales_enabled !== false;
}

export function maxSellableUnits(product: ProductItem, variant?: ProductVariantRow | null): number {
  if (product.track_stock_quantity === false) return 9999;
  if (variant) return Math.max(0, Number(variant.quantity) || 0);
  return Math.max(0, effectiveStockQuantity(product));
}

export function variantLabel(v: ProductVariantRow): string {
  const vals = Object.values(v.option_values ?? {});
  return vals.length > 0 ? vals.join(" / ") : v.sku || "Variant";
}
