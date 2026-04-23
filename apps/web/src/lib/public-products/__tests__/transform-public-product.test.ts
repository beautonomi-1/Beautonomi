/**
 * Regression tests for `transformPublicProduct` — the pure transform shared
 * by `GET /api/public/providers/[slug]/products` and the customer-facing
 * product cards.
 *
 * These lock in the §Release-audit 2026-04 fixes for variant pricing + stock
 * parity so they can't silently regress:
 *   1. variant.retail_price falls back to the parent product price when 0
 *      or non-finite (matches the commit-time `validate-booking` branch).
 *   2. `inStock` honours the parent `track_stock_quantity` flag.
 */

import { describe, it, expect } from "vitest";
import {
  transformPublicProduct,
  effectiveVariantPrice,
  computeInStock,
  type RawProductRow,
  type RawProductVariantRow,
} from "../transform-public-product";

const CURRENCY = "ZAR";

function makeProduct(overrides: Partial<RawProductRow> = {}): RawProductRow {
  return {
    id: "p1",
    name: "Hair Serum",
    short_description: "Lightweight serum",
    description: "Full description",
    retail_price: 250,
    image_urls: ["https://cdn.example/img.jpg"],
    quantity: 10,
    track_stock_quantity: true,
    has_variants: false,
    variant_option_types: [],
    category: "Hair",
    ...overrides,
  };
}

function makeVariant(overrides: Partial<RawProductVariantRow> = {}): RawProductVariantRow {
  return {
    id: "v1",
    product_id: "p1",
    option_values: { size: "50ml" },
    sort_order: 0,
    retail_price: 0,
    quantity: 0,
    sku: null,
    ...overrides,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// effectiveVariantPrice
// ───────────────────────────────────────────────────────────────────────────

describe("effectiveVariantPrice", () => {
  it("returns the variant's own price when it is finite and > 0", () => {
    expect(effectiveVariantPrice({ retail_price: 199 }, 250)).toBe(199);
  });

  it("falls back to parent price when variant price is 0 (DB default)", () => {
    expect(effectiveVariantPrice({ retail_price: 0 }, 250)).toBe(250);
  });

  it("falls back to parent price when variant price is null/undefined", () => {
    expect(effectiveVariantPrice({ retail_price: null }, 250)).toBe(250);
    expect(effectiveVariantPrice({}, 250)).toBe(250);
  });

  it("falls back to parent price when variant price is negative or non-finite", () => {
    expect(effectiveVariantPrice({ retail_price: -10 }, 250)).toBe(250);
    expect(effectiveVariantPrice({ retail_price: Number.NaN }, 250)).toBe(250);
  });

  it("coerces string prices from the DB", () => {
    expect(effectiveVariantPrice({ retail_price: "150" as any }, 250)).toBe(150);
    expect(effectiveVariantPrice({ retail_price: "0" as any }, 250)).toBe(250);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// computeInStock
// ───────────────────────────────────────────────────────────────────────────

describe("computeInStock", () => {
  it("non-variant, tracked: in stock iff parent quantity > 0", () => {
    expect(
      computeInStock({ hasVariants: false, tracksStock: true, parentQuantity: 5, variantQuantities: [] }),
    ).toBe(true);
    expect(
      computeInStock({ hasVariants: false, tracksStock: true, parentQuantity: 0, variantQuantities: [] }),
    ).toBe(false);
  });

  it("non-variant, NOT tracked: always in stock (unlimited inventory)", () => {
    expect(
      computeInStock({ hasVariants: false, tracksStock: false, parentQuantity: 0, variantQuantities: [] }),
    ).toBe(true);
  });

  it("variants, tracked: in stock iff any variant qty > 0", () => {
    expect(
      computeInStock({ hasVariants: true, tracksStock: true, parentQuantity: 0, variantQuantities: [0, 3, 0] }),
    ).toBe(true);
    expect(
      computeInStock({ hasVariants: true, tracksStock: true, parentQuantity: 0, variantQuantities: [0, 0] }),
    ).toBe(false);
  });

  it("variants, NOT tracked: always in stock even when every variant qty is 0", () => {
    // §Release-audit 2026-04: this is the specific case that used to render
    // as "Sold out" and reject the order at commit — print-on-demand,
    // digital goods, drop-ship etc. The provider turns `track_stock_quantity`
    // OFF and expects the product to stay sellable.
    expect(
      computeInStock({ hasVariants: true, tracksStock: false, parentQuantity: 0, variantQuantities: [0, 0, 0] }),
    ).toBe(true);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// transformPublicProduct – full shape
// ───────────────────────────────────────────────────────────────────────────

describe("transformPublicProduct – non-variant products", () => {
  it("returns parent price + respects stock tracking when tracked", () => {
    const card = transformPublicProduct(
      makeProduct({ has_variants: false, track_stock_quantity: true, quantity: 0 }),
      undefined,
      CURRENCY,
    );
    expect(card.price).toBe(250);
    expect(card.inStock).toBe(false);
    expect(card.hasVariants).toBe(false);
    expect(card.variants).toEqual([]);
    expect(card.quantity).toBe(0);
  });

  it("is always in stock when track_stock_quantity = false", () => {
    const card = transformPublicProduct(
      makeProduct({ has_variants: false, track_stock_quantity: false, quantity: 0 }),
      undefined,
      CURRENCY,
    );
    expect(card.inStock).toBe(true);
  });

  it("falls back description to long description when short is empty", () => {
    const card = transformPublicProduct(
      makeProduct({ short_description: null, description: "Long body" }),
      undefined,
      CURRENCY,
    );
    expect(card.description).toBe("Long body");
  });

  it("trims/nulls out blank category strings", () => {
    const card = transformPublicProduct(
      makeProduct({ category: "   " }),
      undefined,
      CURRENCY,
    );
    expect(card.category).toBeNull();
  });

  it("stamps the provided currency", () => {
    const card = transformPublicProduct(makeProduct(), undefined, "USD");
    expect(card.currency).toBe("USD");
  });
});

describe("transformPublicProduct – variant products", () => {
  it("treats has_variants=true with no variants as a plain product", () => {
    // Edge case: a provider enabled variants but hasn't saved any variants
    // yet. We should not crash and should fall back to the parent shape.
    const card = transformPublicProduct(
      makeProduct({ has_variants: true, retail_price: 180, quantity: 4 }),
      [],
      CURRENCY,
    );
    expect(card.hasVariants).toBe(false);
    expect(card.price).toBe(180);
    expect(card.inStock).toBe(true);
    expect(card.variants).toEqual([]);
  });

  it("sorts variants by sort_order", () => {
    const card = transformPublicProduct(
      makeProduct({ has_variants: true }),
      [
        makeVariant({ id: "v-b", sort_order: 2, retail_price: 300, quantity: 1 }),
        makeVariant({ id: "v-a", sort_order: 0, retail_price: 150, quantity: 2 }),
        makeVariant({ id: "v-c", sort_order: 1, retail_price: 200, quantity: 3 }),
      ],
      CURRENCY,
    );
    expect(card.variants.map((v) => v.id)).toEqual(["v-a", "v-c", "v-b"]);
  });

  it("minPrice uses the smallest effective variant price", () => {
    const card = transformPublicProduct(
      makeProduct({ has_variants: true, retail_price: 500 }),
      [
        makeVariant({ id: "v-a", retail_price: 300, quantity: 1 }),
        makeVariant({ id: "v-b", retail_price: 150, quantity: 1 }),
        makeVariant({ id: "v-c", retail_price: 450, quantity: 1 }),
      ],
      CURRENCY,
    );
    expect(card.price).toBe(150);
  });

  it("minPrice falls back to parent when all variants have price=0 (DB default)", () => {
    // This is the customer-visible arm of the parity fix: the PDP must show
    // the parent price, not "R0", for variant rows the provider left
    // untouched.
    const card = transformPublicProduct(
      makeProduct({ has_variants: true, retail_price: 399 }),
      [
        makeVariant({ id: "v-a", retail_price: 0, quantity: 2 }),
        makeVariant({ id: "v-b", retail_price: null, quantity: 5 }),
      ],
      CURRENCY,
    );
    expect(card.price).toBe(399);
    expect(card.variants.map((v) => v.retail_price)).toEqual([399, 399]);
  });

  it("minPrice picks the cheapest variant when at least one has a real price", () => {
    const card = transformPublicProduct(
      makeProduct({ has_variants: true, retail_price: 500 }),
      [
        makeVariant({ id: "v-a", retail_price: 0, quantity: 2 }),
        makeVariant({ id: "v-b", retail_price: 200, quantity: 2 }),
      ],
      CURRENCY,
    );
    // v-a falls back to 500 (parent), v-b stays at 200 → min = 200
    expect(card.price).toBe(200);
  });

  it("inStock is true when track_stock_quantity is OFF even if every variant qty is 0", () => {
    // This is the parity fix for unlimited-inventory variant products
    // (print-on-demand, digital downloads, drop-ship). It used to render
    // as "Sold out" on the customer UI.
    const card = transformPublicProduct(
      makeProduct({ has_variants: true, track_stock_quantity: false }),
      [
        makeVariant({ id: "v-a", retail_price: 100, quantity: 0 }),
        makeVariant({ id: "v-b", retail_price: 120, quantity: 0 }),
      ],
      CURRENCY,
    );
    expect(card.inStock).toBe(true);
    expect(card.track_stock_quantity).toBe(false);
  });

  it("inStock is false only when tracked AND every variant qty is 0", () => {
    const card = transformPublicProduct(
      makeProduct({ has_variants: true, track_stock_quantity: true }),
      [
        makeVariant({ id: "v-a", retail_price: 100, quantity: 0 }),
        makeVariant({ id: "v-b", retail_price: 120, quantity: 0 }),
      ],
      CURRENCY,
    );
    expect(card.inStock).toBe(false);
  });

  it("reports totalQty as sum of variant quantities", () => {
    const card = transformPublicProduct(
      makeProduct({ has_variants: true }),
      [
        makeVariant({ id: "v-a", retail_price: 100, quantity: 3 }),
        makeVariant({ id: "v-b", retail_price: 100, quantity: 5 }),
      ],
      CURRENCY,
    );
    expect(card.quantity).toBe(8);
  });

  it("variants[].retail_price is the effective (post-fallback) price", () => {
    const card = transformPublicProduct(
      makeProduct({ has_variants: true, retail_price: 300 }),
      [
        makeVariant({ id: "v-a", retail_price: 250, quantity: 1 }),
        makeVariant({ id: "v-b", retail_price: 0, quantity: 1 }),
      ],
      CURRENCY,
    );
    expect(card.variants.find((v) => v.id === "v-a")?.retail_price).toBe(250);
    expect(card.variants.find((v) => v.id === "v-b")?.retail_price).toBe(300);
  });
});
