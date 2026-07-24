import { describe, expect, it } from "vitest";
import { resolveBarcodeForPosSale } from "@/lib/provider-portal/resolveBarcodeForPosSale";
import type { ProductItem } from "@/lib/provider-portal/types";

describe("resolveBarcodeForPosSale", () => {
  it("adds untracked product even when quantity is zero", () => {
    const result = resolveBarcodeForPosSale(
      {
        product: {
          id: "p1",
          name: "Untracked",
          quantity: 0,
          track_stock_quantity: false,
          retail_sales_enabled: true,
        },
      },
      [] as ProductItem[],
    );
    expect(result.action).toBe("add");
  });

  it("opens variant picker when needs_variant", () => {
    const result = resolveBarcodeForPosSale(
      {
        product: {
          id: "p2",
          name: "Variant product",
          has_variants: true,
          retail_sales_enabled: true,
        },
        needs_variant: true,
        variants: [
          {
            id: "v1",
            quantity: 1,
            retail_price: 10,
            option_values: { Size: "S" },
          },
        ],
      },
      [] as ProductItem[],
    );
    expect(result.action).toBe("pick_variant");
  });
});
