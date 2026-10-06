/** When to switch category chips to a single picker sheet. */
export const CATEGORY_CHIP_MAX = 6;

/** When "All" shows a flat list vs grouped-by-category sections. */
export const FLAT_CATALOG_ITEM_MAX = 8;

/** Items per category before that group starts collapsed under "All". */
export const COLLAPSE_GROUP_MIN_ITEMS = 4;

export function shouldUseCategoryPicker(categoryCount: number): boolean {
  return categoryCount > CATEGORY_CHIP_MAX;
}

export function shouldGroupAllCatalogItems(itemCount: number): boolean {
  return itemCount > FLAT_CATALOG_ITEM_MAX;
}
