import { describe, it, expect } from "vitest";
import {
  aggregatePackageEntitlements,
  aggregatePackageProductRequirementsFromPublicPackage,
  aggregateProductCartByPackageLineKey,
  bookedProductCounts,
  cartMatchesPublicCatalogPackage,
  computeCatalogPackageServiceDiscount,
  entitlementMismatch,
  exceedsEntitlement,
  productPackageLineKey,
} from "./packageCartMatch";

describe("productPackageLineKey", () => {
  it("builds stable keys for base vs variant lines", () => {
    expect(productPackageLineKey("p1", null)).toBe("p1:");
    expect(productPackageLineKey("p1", "")).toBe("p1:");
    expect(productPackageLineKey("p1", "v1")).toBe("p1:v1");
  });
});

describe("aggregatePackageEntitlements (variant-aware products)", () => {
  it("segregates product lines by variant", () => {
    const { entitlementByProduct } = aggregatePackageEntitlements([
      { product_id: "a", product_variant_id: null, quantity: 1 },
      { product_id: "a", product_variant_id: "v1", quantity: 2 },
    ]);
    expect(entitlementByProduct.get("a:")).toBe(1);
    expect(entitlementByProduct.get("a:v1")).toBe(2);
  });
});

describe("bookedProductCounts", () => {
  it("uses variant when present", () => {
    const m = bookedProductCounts([
      { product_id: "a", product_variant_id: "v1", quantity: 2 },
      { productId: "a", productVariantId: null, quantity: 1 },
    ]);
    expect(m.get("a:v1")).toBe(2);
    expect(m.get("a:")).toBe(1);
  });
});

describe("exceedsEntitlement with composite product keys", () => {
  it("detects wrong variant in cart", () => {
    const ent = new Map<string, number>([
      ["a:", 1],
      ["a:v1", 1],
    ]);
    const booked = new Map<string, number>([["a:v2", 1]]);
    expect(exceedsEntitlement(booked, ent)).toBe("a:v2");
  });
});

describe("entitlementMismatch", () => {
  it("requires every package entitlement line exactly once by quantity", () => {
    const entitlement = new Map<string, number>([
      ["s1", 1],
      ["s2", 2],
    ]);

    expect(entitlementMismatch(new Map([["s1", 1]]), entitlement)).toBe("s2");
    expect(entitlementMismatch(new Map([["s1", 1], ["s2", 1]]), entitlement)).toBe("s2");
    expect(entitlementMismatch(new Map([["s1", 1], ["s2", 2]]), entitlement)).toBeNull();
  });

  it("still rejects lines that are not in the package", () => {
    const entitlement = new Map<string, number>([["p1:v1", 1]]);
    expect(entitlementMismatch(new Map([["p1:v2", 1]]), entitlement)).toBe("p1:v2");
  });
});

describe("cartMatchesPublicCatalogPackage (variant product lines)", () => {
  it("requires matching product variant in cart id", () => {
    const pkg = {
      items: [
        { type: "service" as const, id: "s1" },
        { type: "product" as const, id: "p1", quantity: 1, product_variant_id: "v1" },
      ],
    };
    expect(
      cartMatchesPublicCatalogPackage(
        ["s1"],
        [{ id: "p1:v1", quantity: 1 }],
        { items: pkg.items, services: [{ id: "s1" }] }
      )
    ).toBe(true);
    expect(
      cartMatchesPublicCatalogPackage(
        ["s1"],
        [{ id: "p1", quantity: 1 }],
        { items: pkg.items, services: [{ id: "s1" }] }
      )
    ).toBe(false);
  });
});

describe("aggregateProductCartByPackageLineKey", () => {
  it("aggregates by full line key", () => {
    const m = aggregateProductCartByPackageLineKey([
      { id: "p1", quantity: 1 },
      { id: "p1:v1", quantity: 2 },
    ]);
    expect(m.get("p1:")).toBe(1);
    expect(m.get("p1:v1")).toBe(2);
  });
});

describe("aggregatePackageProductRequirementsFromPublicPackage", () => {
  it("uses variant in requirement key", () => {
    const m = aggregatePackageProductRequirementsFromPublicPackage({
      items: [{ type: "product", id: "p1", quantity: 1, product_variant_id: "v1" }],
    });
    expect(m.get("p1:v1")).toBe(1);
  });
});

describe("computeCatalogPackageServiceDiscount", () => {
  it("uses a positive fixed price as the service bundle price", () => {
    expect(computeCatalogPackageServiceDiscount({ price: 700, discount_percentage: 20 }, 1000)).toBe(300);
  });

  it("treats price 0 as unset and falls back to percentage", () => {
    expect(computeCatalogPackageServiceDiscount({ price: 0, discount_percentage: 25 }, 1000)).toBe(250);
  });

  it("does not make a zero-price package free when no percentage exists", () => {
    expect(computeCatalogPackageServiceDiscount({ price: 0, discount_percentage: null }, 1000)).toBe(0);
  });
});
