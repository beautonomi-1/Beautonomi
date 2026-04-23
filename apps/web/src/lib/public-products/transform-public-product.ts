/**
 * Pure helpers for transforming raw `products` + `product_variants` rows from
 * the database into the shape the customer-facing APIs return (`minPrice`,
 * `inStock`, `variants[].retail_price`, ...).
 *
 * §Release-audit 2026-04:
 *   The previous pass fixed two bugs inside
 *   `/api/public/providers/[slug]/products` and
 *   `/api/public/bookings/_helpers/validate-booking`:
 *
 *   1. Variant `retail_price` must fall back to the parent product's price
 *      when the variant row stores 0 / null (the `product_variants`
 *      migration sets `retail_price NUMERIC NOT NULL DEFAULT 0`, so
 *      providers who only set the parent price would otherwise show a
 *      "R0" variant in the customer UI and let the customer book it for
 *      free server-side).
 *   2. `inStock` must honour the parent `products.track_stock_quantity`
 *      flag — a provider selling unlimited inventory (digital goods,
 *      print-on-demand, etc.) turns stock tracking OFF and expects the
 *      product to stay sellable regardless of the per-variant `quantity`
 *      column (which is 0 by default and never touched).
 *
 * Extracting the transform here means both the route handler and the
 * regression tests exercise the exact same function — the UI can't drift
 * from the commit-time validator again.
 */

export interface RawProductRow {
  id: string;
  name: string;
  short_description?: string | null;
  description?: string | null;
  retail_price?: number | string | null;
  image_urls?: string[] | null;
  quantity?: number | null;
  track_stock_quantity?: boolean | null;
  has_variants?: boolean | null;
  variant_option_types?: unknown;
  category?: string | null;
}

export interface RawProductVariantRow {
  id: string;
  product_id: string;
  option_values?: unknown;
  sort_order?: number | null;
  retail_price?: number | string | null;
  quantity?: number | null;
  sku?: string | null;
}

export interface PublicProductCard {
  id: string;
  name: string;
  description: string;
  category: string | null;
  price: number;
  currency: string;
  imageUrl: string | null;
  inStock: boolean;
  quantity: number;
  track_stock_quantity: boolean;
  hasVariants: boolean;
  variantOptionTypes: unknown;
  variants: Array<{
    id: string;
    option_values: unknown;
    retail_price: number;
    quantity: number;
  }>;
}

/**
 * Resolve a variant's effective retail price, falling back to the parent
 * product's `retail_price` when the variant stores 0 or a non-finite value.
 */
export function effectiveVariantPrice(
  variant: Pick<RawProductVariantRow, "retail_price">,
  parentRetailPrice: number,
): number {
  const raw = Number(variant.retail_price ?? 0);
  return Number.isFinite(raw) && raw > 0 ? raw : parentRetailPrice;
}

/**
 * Compute the "is this product sellable right now" flag respecting
 * `track_stock_quantity` on the parent product. When tracking is OFF the
 * product is considered always in stock regardless of quantity.
 */
export function computeInStock(args: {
  hasVariants: boolean;
  tracksStock: boolean;
  parentQuantity: number;
  variantQuantities: number[];
}): boolean {
  const { hasVariants, tracksStock, parentQuantity, variantQuantities } = args;
  if (hasVariants) {
    if (!tracksStock) return true;
    return variantQuantities.some((q) => q > 0);
  }
  if (!tracksStock) return true;
  return parentQuantity > 0;
}

/**
 * Transform a `products` row + its (pre-fetched) variants into the shape
 * returned by `/api/public/providers/[slug]/products`.
 */
export function transformPublicProduct(
  product: RawProductRow,
  variantsForProduct: RawProductVariantRow[] | undefined,
  currency: string,
): PublicProductCard {
  const rawVariants = Array.isArray(variantsForProduct) ? variantsForProduct : [];
  const withVariants = Boolean(product.has_variants) && rawVariants.length > 0;

  const variantList = withVariants
    ? [...rawVariants].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    : [];

  const parentPrice = Number(product.retail_price ?? 0) || 0;

  const resolvePrice = (v: RawProductVariantRow) =>
    effectiveVariantPrice(v, parentPrice);

  const minPrice =
    withVariants && variantList.length > 0
      ? Math.min(...variantList.map(resolvePrice))
      : parentPrice;

  const tracksStock = Boolean(product.track_stock_quantity);

  const inStock = computeInStock({
    hasVariants: withVariants,
    tracksStock,
    parentQuantity: Number(product.quantity ?? 0) || 0,
    variantQuantities: variantList.map((v) => Number(v.quantity ?? 0) || 0),
  });

  const totalQty = withVariants
    ? variantList.reduce((s, v) => s + (Number(v.quantity ?? 0) || 0), 0)
    : Number(product.quantity ?? 0) || 0;

  const imageUrl =
    Array.isArray(product.image_urls) && product.image_urls.length > 0
      ? product.image_urls[0]
      : null;

  const category =
    typeof product.category === "string" && product.category.trim()
      ? product.category.trim()
      : null;

  return {
    id: product.id,
    name: product.name,
    description: product.short_description || product.description || "",
    category,
    price: minPrice,
    currency,
    imageUrl,
    inStock,
    quantity: totalQty,
    track_stock_quantity: tracksStock,
    hasVariants: withVariants,
    variantOptionTypes: product.variant_option_types ?? [],
    variants: variantList.map((v) => ({
      id: v.id,
      option_values: v.option_values,
      retail_price: resolvePrice(v),
      quantity: Number(v.quantity ?? 0) || 0,
    })),
  };
}
