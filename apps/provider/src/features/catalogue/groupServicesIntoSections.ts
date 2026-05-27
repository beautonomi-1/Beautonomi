import type { CatalogueServiceItem, CategoryOption, ServiceSection } from "./types";

export const OTHER_SERVICES_KEY = "other";
export const ALL_SERVICES_KEY = "all-services";
export const OTHER_SERVICES_SORT_ORDER = 9999;

function serviceTypeSortOrder(serviceType?: string): number {
  switch (serviceType) {
    case "basic":
    case undefined:
      return 0;
    case "addon":
      return 1;
    case "package":
      return 2;
    default:
      return 3;
  }
}

function sortItemsInSection(items: CatalogueServiceItem[]): CatalogueServiceItem[] {
  return [...items].sort((a, b) => {
    const typeDiff = serviceTypeSortOrder(a.service_type) - serviceTypeSortOrder(b.service_type);
    if (typeDiff !== 0) return typeDiff;
    const orderA = a.display_order ?? 0;
    const orderB = b.display_order ?? 0;
    if (orderA !== orderB) return orderA - orderB;
    const titleA = (a.title ?? a.name ?? "").toLowerCase();
    const titleB = (b.title ?? b.name ?? "").toLowerCase();
    return titleA.localeCompare(titleB);
  });
}

function attachVariants(
  topLevel: CatalogueServiceItem[],
  allServices: CatalogueServiceItem[],
): CatalogueServiceItem[] {
  const variantsByParent = new Map<string, CatalogueServiceItem[]>();
  for (const svc of allServices) {
    if (svc.service_type === "variant" && svc.parent_service_id) {
      const list = variantsByParent.get(svc.parent_service_id) ?? [];
      list.push(svc);
      variantsByParent.set(svc.parent_service_id, list);
    }
  }
  return topLevel.map((svc) => {
    const nested = variantsByParent.get(svc.id);
    if (!nested?.length) return svc;
    const sortedVariants = [...nested].sort((a, b) => {
      const orderA = a.display_order ?? 0;
      const orderB = b.display_order ?? 0;
      if (orderA !== orderB) return orderA - orderB;
      return (a.variant_name ?? a.title ?? "").localeCompare(b.variant_name ?? b.title ?? "");
    });
    return { ...svc, variants: sortedVariants };
  });
}

export interface GroupServicesOptions {
  includeVariants?: boolean;
  search?: string;
  filter?: "all" | "active" | "inactive";
}

export function groupServicesIntoSections(
  services: CatalogueServiceItem[],
  categories: CategoryOption[],
  options: GroupServicesOptions = {},
): ServiceSection[] {
  const { includeVariants = true, search = "", filter = "all" } = options;
  const searchLower = search.trim().toLowerCase();

  let filtered = services.filter(
    (s) => s.service_type !== "variant" && !s.parent_service_id,
  );

  if (filter === "active") filtered = filtered.filter((s) => s.is_active !== false);
  if (filter === "inactive") filtered = filtered.filter((s) => s.is_active === false);

  if (searchLower) {
    filtered = filtered.filter((s) => {
      const title = (s.title ?? s.name ?? "").toLowerCase();
      const desc = (s.description ?? "").toLowerCase();
      return title.includes(searchLower) || desc.includes(searchLower);
    });
  }

  const catById = new Map(categories.map((c) => [c.id, c]));
  const categoryIds = new Set(categories.map((c) => c.id));
  const bucket = new Map<string, CatalogueServiceItem[]>();

  for (const item of filtered) {
    const catId = item.provider_category_id;
    const key =
      catId && categoryIds.has(catId)
        ? catId
        : catId && !categoryIds.has(catId)
          ? OTHER_SERVICES_KEY
          : OTHER_SERVICES_KEY;
    const list = bucket.get(key) ?? [];
    list.push(item);
    bucket.set(key, list);
  }

  const sections: ServiceSection[] = [];

  const sortedCategories = [...categories].sort(
    (a, b) => (a.display_order ?? 0) - (b.display_order ?? 0) || a.name.localeCompare(b.name),
  );

  for (const cat of sortedCategories) {
    const items = bucket.get(cat.id);
    if (!items?.length) continue;
    bucket.delete(cat.id);
    const withVariants = includeVariants ? attachVariants(items, services) : items;
    sections.push({
      sectionKey: cat.id,
      title: cat.name,
      color: cat.color ?? null,
      sortOrder: cat.display_order ?? 0,
      items: sortItemsInSection(withVariants),
    });
  }

  const orphaned = bucket.get(OTHER_SERVICES_KEY);
  if (orphaned?.length) {
    const withVariants = includeVariants ? attachVariants(orphaned, services) : orphaned;
    sections.push({
      sectionKey: OTHER_SERVICES_KEY,
      title: "Other Services",
      color: null,
      sortOrder: OTHER_SERVICES_SORT_ORDER,
      items: sortItemsInSection(withVariants),
      isVirtual: true,
    });
  }

  if (categories.length === 0 && filtered.length > 0) {
    const withVariants = includeVariants ? attachVariants(filtered, services) : filtered;
    return [
      {
        sectionKey: ALL_SERVICES_KEY,
        title: "All Services",
        color: null,
        sortOrder: 0,
        items: sortItemsInSection(withVariants),
        isVirtual: true,
      },
    ];
  }

  return sections;
}

export function isVirtualCategoryId(id: string | null | undefined): boolean {
  return id === OTHER_SERVICES_KEY || id === ALL_SERVICES_KEY;
}
