/** Variant slice used when displaying booking-checkout retail lines (matches API transform). */
export type CheckoutProductVariant = {
  id: string;
  retail_price: number;
  quantity: number;
  option_values?: Record<string, string>;
  sort_order?: number;
};

/** Provider retail catalog row on booking checkout (from GET …/products). */
export type CheckoutCatalogProduct = {
  id: string;
  name: string;
  description?: string | null;
  category?: string | null;
  retail_price: number;
  currency: string;
  imageUrl?: string | null;
  hasVariants: boolean;
  defaultVariantId: string | null;
  defaultVariantPrice?: number;
  variants?: CheckoutProductVariant[];
  variantOptionTypes: Array<string | { name: string }>;
  track_stock_quantity: boolean;
  quantity: number;
};

export type SelectedCheckoutProduct = {
  productId: string;
  productVariantId?: string | null;
  name: string;
  price: number;
  quantity: number;
  currency: string;
};

export function unitPriceForCatalogLine(
  prod: CheckoutCatalogProduct,
  variantId: string | null | undefined,
): number {
  if (prod.hasVariants && variantId) {
    const v = prod.variants?.find((x) => x.id === variantId);
    if (v) return v.retail_price;
  }
  return prod.retail_price;
}

export function stockForCatalogLine(
  prod: CheckoutCatalogProduct,
  variantId: string | null | undefined,
): number {
  if (prod.hasVariants && variantId) {
    const v = prod.variants?.find((x) => x.id === variantId);
    if (v) return v.quantity;
  }
  return prod.quantity;
}

export function isCatalogLineOutOfStock(
  prod: CheckoutCatalogProduct,
  variantId: string | null | undefined,
): boolean {
  if (!prod.track_stock_quantity) return false;
  return stockForCatalogLine(prod, variantId) <= 0;
}

export function findSelectedLine(
  selected: SelectedCheckoutProduct[],
  productId: string,
  variantId: string | null | undefined,
): SelectedCheckoutProduct | undefined {
  const key = String(variantId ?? "");
  return selected.find(
    (s) => s.productId === productId && String(s.productVariantId ?? "") === key,
  );
}

export function variantOptionTypeLabel(raw: unknown): string {
  if (typeof raw === "string") return raw;
  if (raw && typeof raw === "object" && "name" in raw && typeof (raw as { name: unknown }).name === "string") {
    return (raw as { name: string }).name;
  }
  return "";
}

export function labelForVariantOptionValues(option_values?: Record<string, string>): string {
  if (!option_values || typeof option_values !== "object") return "";
  return Object.values(option_values)
    .filter((x) => Boolean(x && String(x).trim()))
    .join(" / ");
}

/** Cart / summary label: `Product — Size / Color` when a variant is selected. */
export function bookingCheckoutLineDisplayName(
  productName: string,
  variantId: string | null | undefined,
  variants: CheckoutProductVariant[] | undefined,
): string {
  if (!variantId || !variants?.length) return productName;
  const v = variants.find((x) => x.id === variantId);
  const sub = v ? labelForVariantOptionValues(v.option_values) : "";
  return sub ? `${productName} — ${sub}` : productName;
}
