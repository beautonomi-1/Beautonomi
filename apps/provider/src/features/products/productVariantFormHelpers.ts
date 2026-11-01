import type { ProductVariantRow } from "./types";

export function countVariantRowsWithZeroRetail(rows: Pick<ProductVariantRow, "retail_price">[]): number {
  return rows.filter((r) => {
    const n = Number(r.retail_price);
    return Number.isNaN(n) || n === 0;
  }).length;
}

export function variantRowShouldOpenDetailsInitially(
  row: ProductVariantRow,
  defaultMeasure: string,
): boolean {
  if (row.image_url?.trim()) return true;
  if (row.sku?.trim()) return true;
  if (row.barcode?.trim()) return true;
  if (Number(row.amount) > 0) return true;
  if (Number(row.supply_price) > 0) return true;
  if (Number(row.markup) > 0) return true;
  if (Number(row.reorder_quantity) > 0) return true;
  if (Number(row.low_stock_level) !== 5) return true;
  const measure = (row.measure ?? "").trim();
  if (measure && measure !== defaultMeasure) return true;
  return false;
}
