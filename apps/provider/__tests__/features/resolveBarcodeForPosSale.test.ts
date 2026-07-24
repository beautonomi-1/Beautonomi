import { resolveBarcodeForPosSale } from "@/features/products/resolveBarcodeForPosSale";
import type { ProductItem } from "@/features/products/types";

describe("resolveBarcodeForPosSale", () => {
  const catalog: ProductItem[] = [
    {
      id: "prod-1",
      name: "Shampoo",
      retail_price: 100,
      quantity: 5,
      has_variants: false,
      track_stock_quantity: true,
      retail_sales_enabled: true,
      is_active: true,
    },
  ];

  it("delegates add for simple in-stock product", () => {
    const result = resolveBarcodeForPosSale(
      {
        product: {
          id: "prod-1",
          name: "Shampoo",
          quantity: 5,
          retail_price: 100,
          retail_sales_enabled: true,
          track_stock_quantity: true,
          has_variants: false,
        },
        needs_variant: false,
      },
      catalog,
    );
    expect(result.action).toBe("add");
  });

  it("returns pick_variant when needs_variant", () => {
    const result = resolveBarcodeForPosSale(
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
        variants: [{ id: "var-a", quantity: 2, retail_price: 85, option_values: { Shade: "A" } }],
      },
      [],
    );
    expect(result.action).toBe("pick_variant");
  });
});
