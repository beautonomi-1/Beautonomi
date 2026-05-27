import type { ProductFormState } from "./types";

export function validateProductForm(form: Pick<ProductFormState, "name" | "hasVariants" | "variantRows" | "retail_price">): string | null {
  if (!form.name.trim()) return "Product name is required.";
  if (form.hasVariants) {
    if (form.variantRows.length === 0) {
      return "Generate at least one variant row before saving, or turn off Has variants.";
    }
    const bad = form.variantRows.some((r) => Number(r.retail_price) < 0 || Number.isNaN(Number(r.retail_price)));
    if (bad) return "Each variant needs a valid retail price (≥ 0).";
    return null;
  }
  const retail = parseFloat(form.retail_price);
  if (Number.isNaN(retail) || retail < 0) return "Retail price must be a valid number.";
  return null;
}
