export type WalkInProductVariant = {
  id: string;
  option_values?: Record<string, string>;
  retail_price: number;
  quantity?: number;
  sku?: string | null;
  barcode?: string | null;
};

export type WalkInProduct = {
  id: string;
  name: string;
  retail_price: number;
  quantity?: number;
  is_active?: boolean;
  retail_sales_enabled?: boolean;
  has_variants?: boolean;
  variants?: WalkInProductVariant[];
  track_stock_quantity?: boolean;
  image_urls?: string[] | null;
};

export type BarcodeLookupApiVariant = {
  id: string;
  option_values?: Record<string, string> | null;
  sku?: string | null;
  barcode?: string | null;
  quantity?: number | null;
  retail_price?: number | string | null;
};

export type BarcodeLookupApiProduct = {
  id: string;
  name: string;
  barcode?: string | null;
  sku?: string | null;
  quantity?: number | null;
  retail_price?: number | string | null;
  image_urls?: string[] | null;
  has_variants?: boolean | null;
  retail_sales_enabled?: boolean | null;
  track_stock_quantity?: boolean | null;
};

export type BarcodeLookupApiPayload = {
  product: BarcodeLookupApiProduct;
  variant?: BarcodeLookupApiVariant;
  needs_variant?: boolean;
  variants?: BarcodeLookupApiVariant[];
};

export type ResolveBarcodeResult =
  | { action: "add"; product: WalkInProduct; variant: WalkInProductVariant | null }
  | { action: "pick_variant"; product: WalkInProduct }
  | { action: "error"; message: string };

function mapApiVariant(v: BarcodeLookupApiVariant): WalkInProductVariant {
  return {
    id: v.id,
    option_values: v.option_values ?? undefined,
    sku: v.sku ?? null,
    barcode: v.barcode ?? null,
    quantity: Number(v.quantity ?? 0),
    retail_price: Number(v.retail_price ?? 0),
  };
}

function maxSellableUnits(product: WalkInProduct, variantId: string | null): number {
  if (variantId) {
    const variant = product.variants?.find((v) => v.id === variantId);
    return Math.max(0, Number(variant?.quantity ?? 0));
  }
  if (product.has_variants && (product.variants?.length ?? 0) > 0) {
    return product.variants!.reduce((sum, v) => sum + Math.max(0, Number(v.quantity ?? 0)), 0);
  }
  if (product.track_stock_quantity === false) {
    return 99_999;
  }
  return Math.max(0, Number(product.quantity ?? 0));
}

function buildSyntheticProduct(
  apiProduct: BarcodeLookupApiProduct,
  apiVariants: BarcodeLookupApiVariant[] | undefined,
): WalkInProduct {
  const variants = (apiVariants ?? []).map(mapApiVariant);
  return {
    id: apiProduct.id,
    name: apiProduct.name,
    retail_price: Number(apiProduct.retail_price ?? 0),
    quantity: Number(apiProduct.quantity ?? 0),
    is_active: true,
    retail_sales_enabled: apiProduct.retail_sales_enabled !== false,
    has_variants: Boolean(apiProduct.has_variants),
    variants,
    track_stock_quantity: apiProduct.track_stock_quantity ?? true,
    image_urls: apiProduct.image_urls ?? [],
  };
}

function mergeWithLocalCatalog(
  apiProduct: BarcodeLookupApiProduct,
  apiVariants: BarcodeLookupApiVariant[] | undefined,
  localCatalog: WalkInProduct[],
): WalkInProduct {
  const local = localCatalog.find((p) => p.id === apiProduct.id);
  if (local) return local;
  return buildSyntheticProduct(apiProduct, apiVariants);
}

export function resolveBarcodeForWalkInSale(
  payload: BarcodeLookupApiPayload | null | undefined,
  localCatalog: WalkInProduct[],
): ResolveBarcodeResult {
  if (!payload?.product?.id) {
    return { action: "error", message: "No product found for this barcode or SKU" };
  }

  if (payload.product.retail_sales_enabled === false) {
    return { action: "error", message: "This product is not available for retail sale" };
  }

  const product = mergeWithLocalCatalog(
    payload.product,
    payload.needs_variant ? payload.variants : payload.variant ? [payload.variant] : payload.variants,
    localCatalog,
  );

  if (payload.needs_variant || (product.has_variants && !payload.variant)) {
    if (!product.has_variants || (product.variants?.length ?? 0) === 0) {
      return { action: "error", message: "Select a product option before adding to cart" };
    }
    return { action: "pick_variant", product };
  }

  const variant = payload.variant ? mapApiVariant(payload.variant) : null;
  const max = maxSellableUnits(product, variant?.id ?? null);
  if (max < 1) {
    const label = variant
      ? `${product.name} — ${Object.values(variant.option_values ?? {}).join(" / ") || variant.sku || "Option"}`
      : product.name;
    return { action: "error", message: `${label} is out of stock` };
  }

  return { action: "add", product, variant };
}

export function barcodeLookupQueryParams(code: string): URLSearchParams {
  const q = code.trim();
  const params = new URLSearchParams();
  if (/^\d+$/.test(q) || q.length >= 8) {
    params.set("barcode", q);
  } else {
    params.set("sku", q);
  }
  return params;
}

export function mapApiErrorCodeToMessage(code: string | null | undefined, fallback: string): string {
  switch (code) {
    case "NOT_FOR_RETAIL":
      return "This product is not available for retail sale";
    case "AMBIGUOUS_BARCODE":
      return "Multiple products match this code — fix duplicates in your catalogue";
    case "NOT_FOUND":
      return "No product found for this barcode or SKU";
    default:
      return fallback;
  }
}
