import type { ProductVariantRow, VariantOptionType } from "./types";

export function optionValuesKey(ov: Record<string, string> | undefined): string {
  if (!ov || Object.keys(ov).length === 0) return "";
  const sorted = Object.keys(ov)
    .sort()
    .reduce(
      (acc, k) => {
        acc[k] = ov[k];
        return acc;
      },
      {} as Record<string, string>,
    );
  return JSON.stringify(sorted);
}

export function generateVariantMatrixRows(
  optionTypes: VariantOptionType[],
  existingRows: ProductVariantRow[],
  defaults: { measure: string },
): ProductVariantRow[] {
  const validTypes = optionTypes
    .map((t) => ({
      name: t.name.trim(),
      values: [...new Set(t.values.map((x) => x.trim()).filter(Boolean))],
    }))
    .filter((t) => t.name.length > 0 && t.values.length > 0);

  if (validTypes.length === 0) return [];

  let combos: Record<string, string>[] = [{}];
  for (const dim of validTypes) {
    const next: Record<string, string>[] = [];
    for (const combo of combos) {
      for (const val of dim.values) {
        next.push({ ...combo, [dim.name]: val });
      }
    }
    combos = next;
  }

  return combos.map((option_values, idx) => {
    const existing = existingRows.find(
      (r) => optionValuesKey(r.option_values) === optionValuesKey(option_values),
    );
    if (existing) return { ...existing, option_values };
    return {
      option_values,
      sku: "",
      barcode: "",
      quantity: 0,
      supply_price: 0,
      retail_price: 0,
      low_stock_level: 5,
      reorder_quantity: 0,
      markup: 0,
      image_url: "",
      measure: defaults.measure || "ml",
      amount: 0,
      sort_order: idx,
    };
  });
}
