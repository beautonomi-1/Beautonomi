import {
  barcodeLookupQueryParams,
  resolveBarcodeForWalkInSale,
  type BarcodeLookupApiPayload,
  type WalkInProduct,
} from "@/features/products/resolveBarcodeForWalkInSale";

describe("resolveBarcodeForWalkInSale", () => {
  const localCatalog: WalkInProduct[] = [
    {
      id: "prod-1",
      name: "Local Shampoo",
      retail_price: 100,
      quantity: 5,
      has_variants: false,
      track_stock_quantity: true,
      retail_sales_enabled: true,
    },
  ];

  it("returns add for simple in-stock product from local catalog", () => {
    const result = resolveBarcodeForWalkInSale(
      {
        product: {
          id: "prod-1",
          name: "Local Shampoo",
          quantity: 5,
          retail_price: 100,
          retail_sales_enabled: true,
          track_stock_quantity: true,
          has_variants: false,
        },
        needs_variant: false,
      },
      localCatalog,
    );
    expect(result.action).toBe("add");
    if (result.action === "add") {
      expect(result.product.id).toBe("prod-1");
      expect(result.variant).toBeNull();
    }
  });

  it("returns pick_variant when needs_variant is true", () => {
    const result = resolveBarcodeForWalkInSale(
      {
        product: {
          id: "prod-2",
          name: "Toner",
          quantity: 0,
          retail_price: 80,
          has_variants: true,
          retail_sales_enabled: true,
          track_stock_quantity: true,
        },
        needs_variant: true,
        variants: [
          { id: "var-a", quantity: 2, retail_price: 85, option_values: { Shade: "A" } },
          { id: "var-b", quantity: 1, retail_price: 86, option_values: { Shade: "B" } },
        ],
      },
      [],
    );
    expect(result.action).toBe("pick_variant");
    if (result.action === "pick_variant") {
      expect(result.product.variants).toHaveLength(2);
    }
  });

  it("returns error when out of stock", () => {
    const result = resolveBarcodeForWalkInSale(
      {
        product: {
          id: "prod-3",
          name: "Empty",
          quantity: 0,
          retail_price: 10,
          has_variants: false,
          retail_sales_enabled: true,
          track_stock_quantity: true,
        },
      },
      [],
    );
    expect(result.action).toBe("error");
    if (result.action === "error") {
      expect(result.message).toMatch(/out of stock/i);
    }
  });

  it("returns error for not retail enabled", () => {
    const result = resolveBarcodeForWalkInSale(
      {
        product: {
          id: "prod-4",
          name: "Internal",
          quantity: 5,
          retail_price: 10,
          retail_sales_enabled: false,
        },
      },
      [],
    );
    expect(result.action).toBe("error");
    if (result.action === "error") {
      expect(result.message).toMatch(/retail sale/i);
    }
  });

  it("uses local catalog product when id matches", () => {
    const result = resolveBarcodeForWalkInSale(
      {
        product: {
          id: "prod-1",
          name: "API name",
          quantity: 0,
          retail_price: 1,
          has_variants: false,
          retail_sales_enabled: true,
          track_stock_quantity: true,
        },
      },
      localCatalog,
    );
    expect(result.action).toBe("add");
    if (result.action === "add") {
      expect(result.product.name).toBe("Local Shampoo");
    }
  });

  it("builds synthetic product with track_stock_quantity false as unlimited", () => {
    const result = resolveBarcodeForWalkInSale(
      {
        product: {
          id: "prod-5",
          name: "Untracked",
          quantity: 0,
          retail_price: 20,
          has_variants: false,
          retail_sales_enabled: true,
          track_stock_quantity: false,
        },
      },
      [],
    );
    expect(result.action).toBe("add");
  });
});

describe("barcodeLookupQueryParams", () => {
  it("uses barcode for numeric codes", () => {
    expect(barcodeLookupQueryParams("1234567890123").get("barcode")).toBe("1234567890123");
  });

  it("uses sku for short alpha codes", () => {
    expect(barcodeLookupQueryParams("SH-1").get("sku")).toBe("SH-1");
  });
});
