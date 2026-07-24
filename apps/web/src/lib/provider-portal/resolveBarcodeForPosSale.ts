import type { BarcodeLookupResult, BarcodeVariant } from "@/components/provider-portal/BarcodeLookup";
import type { ProductItem, ProductVariantItem } from "@/lib/provider-portal/types";

export type PosBarcodeResolveResult =
  | { action: "add"; product: ProductItem; variant: ProductVariantItem | null }
  | { action: "pick_variant"; product: ProductItem }
  | { action: "error"; message: string };

function formatVariantName(v: BarcodeVariant): string {
  const vals = v.option_values ? Object.values(v.option_values).filter(Boolean) : [];
  if (vals.length) return vals.map(String).join(" / ");
  if (v.sku?.trim()) return v.sku.trim();
  return "Variant";
}

function mapApiVariant(v: BarcodeVariant, productId: string): ProductVariantItem {
  return {
    id: v.id,
    product_id: productId,
    option_values: v.option_values ?? {},
    sort_order: 0,
    sku: v.sku ?? null,
    barcode: v.barcode ?? null,
    quantity: Number(v.quantity ?? 0),
    retail_price: Number(v.retail_price ?? 0),
  };
}

function buildSyntheticProduct(result: BarcodeLookupResult, existing?: ProductItem): ProductItem {
  if (existing) return existing;
  const { product, variant, variants: apiVariants } = result;
  const mappedVariants = (apiVariants ?? []).map((v) => mapApiVariant(v, product.id));
  const untracked = product.track_stock_quantity === false;
  const effectiveQty = variant
    ? Number(variant.quantity ?? 0)
    : mappedVariants.length > 0
      ? mappedVariants.reduce((sum, v) => sum + Number(v.quantity ?? 0), 0)
      : Number(product.quantity ?? 0);
  return {
    id: product.id,
    name: product.name ?? "Product",
    barcode: product.barcode ?? undefined,
    sku: product.sku ?? undefined,
    category: "",
    quantity: Number(product.quantity ?? 0),
    effective_quantity: untracked ? 99_999 : effectiveQty,
    retail_price: Number(variant?.retail_price ?? product.retail_price ?? 0),
    has_variants: Boolean(product.has_variants || result.needs_variant),
    variants: mappedVariants,
    track_stock_quantity: product.track_stock_quantity ?? true,
    retail_sales_enabled: product.retail_sales_enabled !== false,
    is_active: true,
  } as ProductItem;
}

export function resolveBarcodeForPosSale(
  result: BarcodeLookupResult,
  catalog: ProductItem[],
): PosBarcodeResolveResult {
  if (result.product.retail_sales_enabled === false) {
    return { action: "error", message: "This product is not available for retail sale" };
  }

  const existing = catalog.find((p) => p.id === result.product.id);
  const product = buildSyntheticProduct(result, existing);

  if (result.needs_variant || (product.has_variants && !result.variant)) {
    if (!product.has_variants || (product.variants?.length ?? 0) === 0) {
      return { action: "error", message: "Select a product option before adding to cart" };
    }
    return { action: "pick_variant", product };
  }

  const untracked = result.product.track_stock_quantity === false || product.track_stock_quantity === false;

  if (result.variant) {
    const variant = mapApiVariant(result.variant, product.id);
    if (!untracked && variant.quantity <= 0) {
      return {
        action: "error",
        message: `${product.name} — ${formatVariantName(result.variant)} is out of stock`,
      };
    }
    return { action: "add", product, variant };
  }

  const stock = product.effective_quantity ?? product.quantity;
  if (!untracked && stock <= 0) {
    return { action: "error", message: `${product.name} is out of stock` };
  }

  return { action: "add", product, variant: null };
}
