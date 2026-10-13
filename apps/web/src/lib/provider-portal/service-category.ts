import type { ServiceItem } from "@/lib/provider-portal/types";

export const UNCATEGORIZED_SERVICE_CATEGORY = "__uncategorized__";

export function getServiceCategoryInfo(
  service: Pick<
    ServiceItem,
    "category_id" | "provider_category_id" | "category_name" | "category_order"
  >,
  uncategorizedLabel: string,
): { id: string; label: string; order: number } {
  const id =
    service.provider_category_id ??
    service.category_id ??
    UNCATEGORIZED_SERVICE_CATEGORY;
  const label = service.category_name?.trim() || uncategorizedLabel;
  const order = service.category_order ?? 9999;
  return { id, label, order };
}

export type ServiceCategoryOption = {
  id: string;
  label: string;
  count: number;
  order: number;
};

export function buildServiceCategoryOptions(
  services: ServiceItem[],
  uncategorizedLabel: string,
  isIncluded: (service: ServiceItem) => boolean,
): ServiceCategoryOption[] {
  const map = new Map<string, ServiceCategoryOption>();
  for (const svc of services) {
    if (!isIncluded(svc)) continue;
    const info = getServiceCategoryInfo(svc, uncategorizedLabel);
    const existing = map.get(info.id);
    if (existing) {
      existing.count += 1;
    } else {
      map.set(info.id, {
        id: info.id,
        label: info.label,
        count: 1,
        order: info.order,
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => {
    if (a.id === UNCATEGORIZED_SERVICE_CATEGORY) return 1;
    if (b.id === UNCATEGORIZED_SERVICE_CATEGORY) return -1;
    if (a.order !== b.order) return a.order - b.order;
    return a.label.localeCompare(b.label);
  });
}

export function filterServicesByCategory<T extends ServiceItem>(
  services: T[],
  categoryId: string,
  uncategorizedLabel: string,
  isIncluded: (service: T) => boolean,
): T[] {
  const included = services.filter(isIncluded);
  if (categoryId === "all") return included;
  return included.filter(
    (s) => getServiceCategoryInfo(s, uncategorizedLabel).id === categoryId,
  );
}
