import type { ProductItem, ProductSection } from "./types";
import { OTHER_PRODUCTS_KEY, OTHER_PRODUCTS_SORT_ORDER, UNCATEGORIZED_PRODUCT_LABEL } from "./types";

export function productCategoryLabel(p: ProductItem): string {
  const t = (p.category ?? "").trim();
  return t.length > 0 ? t : UNCATEGORIZED_PRODUCT_LABEL;
}

export interface GroupProductsOptions {
  search?: string;
}

export function groupProductsIntoSections(
  products: ProductItem[],
  options: GroupProductsOptions = {},
): ProductSection[] {
  const { search = "" } = options;
  const searchLower = search.trim().toLowerCase();

  let filtered = [...products];
  if (searchLower) {
    filtered = filtered.filter((p) => {
      const hay = `${p.name} ${p.sku ?? ""} ${p.barcode ?? ""} ${p.category ?? ""}`.toLowerCase();
      return hay.includes(searchLower);
    });
  }

  const bucket = new Map<string, ProductItem[]>();
  for (const item of filtered) {
    const label = productCategoryLabel(item);
    const key = label === UNCATEGORIZED_PRODUCT_LABEL ? OTHER_PRODUCTS_KEY : label;
    const list = bucket.get(key) ?? [];
    list.push(item);
    bucket.set(key, list);
  }

  const sections: ProductSection[] = [...bucket.entries()]
    .map(([sectionKey, items]) => ({
      sectionKey,
      title: sectionKey === OTHER_PRODUCTS_KEY ? UNCATEGORIZED_PRODUCT_LABEL : sectionKey,
      sortOrder: sectionKey === OTHER_PRODUCTS_KEY ? OTHER_PRODUCTS_SORT_ORDER : 0,
      items: [...items].sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.title.localeCompare(b.title);
    });

  return sections;
}
