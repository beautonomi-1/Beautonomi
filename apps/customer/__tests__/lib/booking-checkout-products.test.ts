import {
  bookingCheckoutLineDisplayName,
  findSelectedLine,
  isCatalogLineOutOfStock,
  labelForVariantOptionValues,
  unitPriceForCatalogLine,
  variantOptionTypeLabel,
  type CheckoutCatalogProduct,
} from "@/lib/booking-checkout-products";

const baseProduct: CheckoutCatalogProduct = {
  id: "p1",
  name: "Serum",
  retail_price: 100,
  currency: "ZAR",
  hasVariants: false,
  defaultVariantId: null,
  variantOptionTypes: [],
  track_stock_quantity: true,
  quantity: 5,
};

describe("variantOptionTypeLabel", () => {
  it("returns string as-is", () => {
    expect(variantOptionTypeLabel("Size")).toBe("Size");
  });

  it("reads name from object", () => {
    expect(variantOptionTypeLabel({ name: "Color" })).toBe("Color");
  });

  it("returns empty for other values", () => {
    expect(variantOptionTypeLabel(null)).toBe("");
    expect(variantOptionTypeLabel(1)).toBe("");
  });
});

describe("labelForVariantOptionValues", () => {
  it("joins non-empty option values", () => {
    expect(
      labelForVariantOptionValues({ Size: "L", Color: "Red" }),
    ).toBe("L / Red");
  });

  it("skips empty strings", () => {
    expect(labelForVariantOptionValues({ Size: "M", Color: "" })).toBe("M");
  });

  it("returns empty when missing", () => {
    expect(labelForVariantOptionValues()).toBe("");
  });
});

describe("bookingCheckoutLineDisplayName", () => {
  const variants = [
    {
      id: "v1",
      retail_price: 10,
      quantity: 1,
      option_values: { Size: "S", Color: "Blue" },
    },
  ];

  it("returns product name when no variant", () => {
    expect(bookingCheckoutLineDisplayName("Cream", null, variants)).toBe("Cream");
    expect(bookingCheckoutLineDisplayName("Cream", undefined, [])).toBe("Cream");
  });

  it("appends variant label when id matches", () => {
    expect(bookingCheckoutLineDisplayName("Cream", "v1", variants)).toBe("Cream — S / Blue");
  });

  it("returns product name when id not found", () => {
    expect(bookingCheckoutLineDisplayName("Cream", "missing", variants)).toBe("Cream");
  });
});

describe("catalog line helpers", () => {
  it("unitPriceForCatalogLine uses variant price when set", () => {
    const prod: CheckoutCatalogProduct = {
      ...baseProduct,
      hasVariants: true,
      variants: [{ id: "v1", retail_price: 80, quantity: 2, option_values: { Size: "S" } }],
    };
    expect(unitPriceForCatalogLine(prod, "v1")).toBe(80);
    expect(unitPriceForCatalogLine(prod, null)).toBe(100);
  });

  it("isCatalogLineOutOfStock respects track_stock_quantity", () => {
    expect(isCatalogLineOutOfStock(baseProduct, null)).toBe(false);
    expect(isCatalogLineOutOfStock({ ...baseProduct, quantity: 0 }, null)).toBe(true);
    expect(isCatalogLineOutOfStock({ ...baseProduct, track_stock_quantity: false, quantity: 0 }, null)).toBe(
      false,
    );
  });

  it("findSelectedLine matches product and variant key", () => {
    const selected = [
      {
        productId: "p1",
        productVariantId: "v1",
        name: "Serum — S",
        price: 80,
        quantity: 2,
        currency: "ZAR",
      },
    ];
    expect(findSelectedLine(selected, "p1", "v1")?.quantity).toBe(2);
    expect(findSelectedLine(selected, "p1", null)).toBeUndefined();
  });
});
