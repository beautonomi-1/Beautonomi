import { groupProductsIntoSections } from "@/features/products/groupProductsIntoSections";
import { validateProductForm } from "@/features/products/validateProductForm";
import { computeMarkupFromPrices, computeRetailFromMarkup } from "@/features/products/markupCalc";

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
});

describe("markupCalc", () => {
  it("computes markup from supply and retail", () => {
    expect(computeMarkupFromPrices(100, 150)).toBe(50);
  });

  it("computes retail from markup", () => {
    expect(computeRetailFromMarkup(100, 50)).toBe(150);
  });
});
