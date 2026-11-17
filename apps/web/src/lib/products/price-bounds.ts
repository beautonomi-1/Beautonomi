import { MAX_PRODUCT_PRICE_MAJOR } from "@/lib/payments/client-amount-bounds";

/** F3-01: catalog prices match the DB CHECK added in 10138 (0–1_000_000). */
export function productCatalogAmountError(label: string, n: number): string | null {
  if (!Number.isFinite(n) || n < 0 || n > MAX_PRODUCT_PRICE_MAJOR) {
    return `${label} must be between 0 and ${MAX_PRODUCT_PRICE_MAJOR}`;
  }
  return null;
}

export function productTaxRateError(n: number): string | null {
  if (!Number.isFinite(n) || n < 0 || n > 100) {
    return "tax_rate must be between 0 and 100";
  }
  return null;
}

export function variantCatalogPricesError(
  variants: Array<{ retail_price?: unknown; supply_price?: unknown }>,
): string | null {
  for (let i = 0; i < variants.length; i++) {
    const v = variants[i];
    const retail = parseFloat(String(v.retail_price ?? 0));
    const supply = Number(v.supply_price ?? 0);
    const err =
      productCatalogAmountError(`variants[${i}].retail_price`, retail) ||
      productCatalogAmountError(`variants[${i}].supply_price`, supply);
    if (err) return err;
  }
  return null;
}
