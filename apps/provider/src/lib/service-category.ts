export const UNCATEGORIZED_SERVICE_CATEGORY = "__uncategorized__";
export const UNCATEGORIZED_GROUP_SERVICE_CATEGORY = "__uncategorized__";

type ServiceCategorySource = {
  provider_category_id?: string | null;
  category_id?: string | null;
  global_category_id?: string | null;
  category_name?: string | null;
  global_category_name?: string | null;
  category?: { id?: string | null; name?: string | null; title?: string | null } | null;
  global_category?: { id?: string | null; name?: string | null; title?: string | null } | null;
  provider_categories?: {
    id?: string | null;
    name?: string | null;
    title?: string | null;
    display_order?: number | null;
  } | null;
};

/** Pill id/label both come from the provider menu category (not global marketplace id). */
export function getServiceCategoryInfo(
  service: ServiceCategorySource,
  otherLabel = "Other",
): { id: string; label: string; order: number } {
  const id =
    service.provider_category_id ||
    service.provider_categories?.id ||
    UNCATEGORIZED_SERVICE_CATEGORY;
  const label =
    service.provider_categories?.name ||
    service.provider_categories?.title ||
    service.category_name ||
    otherLabel;
  const order =
    typeof service.provider_categories?.display_order === "number"
      ? service.provider_categories.display_order
      : 9999;
  return { id, label, order };
}
