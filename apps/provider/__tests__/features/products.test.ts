import { groupProductsIntoSections } from "@/features/products/groupProductsIntoSections";
import { validateProductForm } from "@/features/products/validateProductForm";
import { computeMarkupFromPrices, computeRetailFromMarkup } from "@/features/products/markupCalc";
import { buildProductPayload } from "@/features/products/buildProductPayload";
import {
  countVariantRowsWithZeroRetail,
  variantRowShouldOpenDetailsInitially,
} from "@/features/products/productVariantFormHelpers";
import type { ProductFormState } from "@/features/products/types";

describe("groupProductsIntoSections", () => {
  it("buckets by category and puts uncategorized in Other Products", () => {
    const sections = groupProductsIntoSections([
      { id: "1", name: "B", category: "Hair" },
      { id: "2", name: "A", category: "Hair" },
      { id: "3", name: "C", category: "" },
    ]);
    expect(sections).toHaveLength(2);
    expect(sections[0].title).toBe("Hair");
    expect(sections[0].items.map((p) => p.name)).toEqual(["A", "B"]);
    expect(sections[1].title).toBe("Other Products");
  });
});

describe("validateProductForm", () => {
  it("requires name", () => {
    expect(validateProductForm({ name: "  ", hasVariants: false, variantRows: [], retail_price: "10" })).toMatch(/name/i);
  });

  it("requires variant rows when hasVariants", () => {
    expect(
      validateProductForm({ name: "X", hasVariants: true, variantRows: [], retail_price: "0" }),
    ).toMatch(/variant/i);
  });

  it("allows variant retail price of 0", () => {
    expect(
      validateProductForm({
        name: "X",
        hasVariants: true,
        variantRows: [{ retail_price: 0 } as ProductFormState["variantRows"][0]],
        retail_price: "0",
      }),
    ).toBeNull();
  });

  it("rejects negative variant retail price", () => {
    expect(
      validateProductForm({
        name: "X",
        hasVariants: true,
        variantRows: [{ retail_price: -1 } as ProductFormState["variantRows"][0]],
        retail_price: "0",
      }),
    ).toMatch(/retail price/i);
  });
});

describe("countVariantRowsWithZeroRetail", () => {
  it("counts rows at zero or invalid retail", () => {
    expect(
      countVariantRowsWithZeroRetail([{ retail_price: 0 }, { retail_price: 10 }, { retail_price: NaN }]),
    ).toBe(2);
  });
});

describe("variantRowShouldOpenDetailsInitially", () => {
  const freshRow = {
    option_values: { Size: "250ml" },
    sku: "",
    barcode: "",
    measure: "ml",
    amount: 0,
    quantity: 0,
    low_stock_level: 5,
    reorder_quantity: 0,
    supply_price: 0,
    retail_price: 0,
    markup: 0,
    image_url: "",
  };

  it("keeps More details closed for a newly generated row", () => {
    expect(variantRowShouldOpenDetailsInitially(freshRow, "ml")).toBe(false);
  });

  it("opens when barcode or cost is set", () => {
    expect(variantRowShouldOpenDetailsInitially({ ...freshRow, barcode: "X" }, "ml")).toBe(true);
    expect(variantRowShouldOpenDetailsInitially({ ...freshRow, supply_price: 10 }, "ml")).toBe(true);
  });
});

function baseProductForm(overrides: Partial<ProductFormState> = {}): ProductFormState {
  return {
    name: "Shampoo",
    barcode: "PARENT-BC",
    brand: "",
    measure: "ml",
    amount: "500",
    short_description: "",
    description: "",
    category: "",
    supplier: "",
    sku: "PARENT-SKU",
    quantity: "5",
    low_stock_level: "5",
    reorder_quantity: "0",
    supply_price: "10",
    retail_price: "20",
    markup: "",
    tax_rate: "15",
    retail_sales_enabled: true,
    team_member_commission_enabled: false,
    track_stock_quantity: true,
    receive_low_stock_notifications: false,
    is_active: true,
    image_urls: [],
    weight_grams: "500",
    hasVariants: false,
    variantOptionTypes: [],
    variantRows: [],
    ...overrides,
  };
}

describe("buildProductPayload", () => {
  it("includes parent barcode and sku without variants", () => {
    const { payload } = buildProductPayload(baseProductForm());
    expect(payload.barcode).toBe("PARENT-BC");
    expect(payload.sku).toBe("PARENT-SKU");
    expect(payload.measure).toBe("ml");
    expect(payload.amount).toBe(500);
    expect(payload.tax_rate).toBe(15);
  });

  it("omits parent barcode, sku, measure, and amount with variants but keeps tax and variant barcodes", () => {
    const { payload, withVariants } = buildProductPayload(
      baseProductForm({
        hasVariants: true,
        variantOptionTypes: [{ name: "Size", values: ["S"] }],
        variantRows: [
          {
            option_values: { Size: "S" },
            sku: "",
            barcode: "VAR-1",
            measure: "ml",
            amount: 250,
            quantity: 3,
            low_stock_level: 5,
            reorder_quantity: 0,
            supply_price: 0,
            retail_price: 12,
            markup: 0,
            image_url: "",
          },
        ],
      }),
    );
    expect(withVariants).toBe(true);
    expect(payload.barcode).toBeUndefined();
    expect(payload.sku).toBeUndefined();
    expect(payload.measure).toBeUndefined();
    expect(payload.amount).toBeUndefined();
    expect(payload.tax_rate).toBe(15);
    const variants = payload.variants as { barcode?: string }[];
    expect(variants[0].barcode).toBe("VAR-1");
  });
});

describe("markupCalc", () => {
  it("computes markup from supply and retail", () => {
    expect(computeMarkupFromPrices(100, 150)).toBe(50);
  });

  it("computes retail from markup", () => {
    expect(computeRetailFromMarkup(100, 50)).toBe(150);
  });
});
