import { describe, expect, it } from "vitest";
import type { BarcodeLookupResult } from "@/components/provider-portal/BarcodeLookup";

/** Mirrors buildWalkInProductFromBarcodeHit in walk-in/page.tsx for unit coverage. */
function buildWalkInProductFromBarcodeHit(
  result: BarcodeLookupResult,
  existing: { track_stock_quantity?: boolean; effective_quantity?: number } | undefined,
  taxRate: number,
) {
  if (existing) return existing;
  const { product, variant, variants: apiVariants } = result;
  const effectiveQty = variant
    ? Number(variant.quantity ?? 0)
    : (apiVariants ?? []).reduce((sum, v) => sum + Number(v.quantity ?? 0), 0) ||
      Number(product.quantity ?? 0);
  const untracked = product.track_stock_quantity === false;
  return {
    effective_quantity: untracked ? 99_999 : effectiveQty,
    track_stock_quantity: product.track_stock_quantity ?? true,
    tax_rate: taxRate,
  };
}

describe("walk-in barcode product hydration", () => {
  it("treats untracked stock as sellable when parent quantity is zero", () => {
    const built = buildWalkInProductFromBarcodeHit(
      {
        product: {
          id: "p1",
          name: "Untracked item",
          quantity: 0,
          track_stock_quantity: false,
        },
      },
      undefined,
      15,
    );
    expect(built.effective_quantity).toBe(99_999);
    expect(built.track_stock_quantity).toBe(false);
  });

  it("prefers existing catalog row when product is already loaded", () => {
    const built = buildWalkInProductFromBarcodeHit(
      {
        product: { id: "p1", name: "X", quantity: 0, track_stock_quantity: false },
      },
      { track_stock_quantity: false, effective_quantity: 12 },
      0,
    );
    expect(built.effective_quantity).toBe(12);
  });
});
