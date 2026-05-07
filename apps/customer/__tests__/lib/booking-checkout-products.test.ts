import {
  bookingCheckoutLineDisplayName,
  labelForVariantOptionValues,
  variantOptionTypeLabel,
} from "@/lib/booking-checkout-products";

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
