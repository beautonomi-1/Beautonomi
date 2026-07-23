import type { ProductItem, ProductVariantRow } from "./types";
import {
  resolveBarcodeForWalkInSale,
  type BarcodeLookupApiPayload,
  type WalkInProduct,
  type WalkInProductVariant,
} from "./resolveBarcodeForWalkInSale";

export type PosBarcodeResolveResult =
  | { action: "add"; product: ProductItem; variant: ProductVariantRow | null }
  | { action: "pick_variant"; product: ProductItem }
  | { action: "error"; message: string };

function toWalkInVariant(v: ProductVariantRow): WalkInProductVariant {
  return {
    id: String(v.id),
    option_values: v.option_values,
    retail_price: Number(v.retail_price ?? 0),
    quantity: Number(v.quantity ?? 0),
    sku: v.sku ?? null,
    barcode: v.barcode ?? null,
  };
}

function toWalkInProduct(p: ProductItem): WalkInProduct {
  return {
    id: p.id,
    name: p.name,
    retail_price: Number(p.retail_price ?? 0),
    quantity: p.quantity,
    is_active: p.is_active,
    retail_sales_enabled: p.retail_sales_enabled,
    has_variants: p.has_variants,
    variants: (p.variants ?? [])
      .filter((v) => v.id)
      .map((v) => toWalkInVariant(v as ProductVariantRow & { id: string })),
    track_stock_quantity: p.track_stock_quantity,
    image_urls: p.image_urls,
  };
}

function emptyVariantFields(): Omit<ProductVariantRow, "id" | "option_values" | "sku" | "barcode" | "quantity" | "retail_price"> {
  return {
    measure: "",
    amount: 0,
    low_stock_level: 0,
    reorder_quantity: 0,
    supply_price: 0,
    markup: 0,
    image_url: "",
  };
}

function toProductVariantRow(v: WalkInProductVariant): ProductVariantRow {
  return {
    id: v.id,
    option_values: v.option_values ?? {},
    sku: v.sku ?? "",
    barcode: v.barcode ?? "",
    quantity: v.quantity ?? 0,
    retail_price: v.retail_price,
    ...emptyVariantFields(),
  };
}

function toProductItem(p: WalkInProduct): ProductItem {
  return {
    id: p.id,
    name: p.name,
    retail_price: p.retail_price,
    quantity: p.quantity,
    is_active: p.is_active,
    retail_sales_enabled: p.retail_sales_enabled,
    has_variants: p.has_variants,
    track_stock_quantity: p.track_stock_quantity,
    image_urls: p.image_urls ?? undefined,
    variants: (p.variants ?? []).map(toProductVariantRow),
  };
}

export function resolveBarcodeForPosSale(
  payload: BarcodeLookupApiPayload | null | undefined,
  catalog: ProductItem[],
): PosBarcodeResolveResult {
  const result = resolveBarcodeForWalkInSale(payload, catalog.map(toWalkInProduct));
  if (result.action === "error") return result;
  if (result.action === "pick_variant") {
    return { action: "pick_variant", product: toProductItem(result.product) };
  }
  return {
    action: "add",
    product: toProductItem(result.product),
    variant: result.variant ? toProductVariantRow(result.variant) : null,
  };
}
