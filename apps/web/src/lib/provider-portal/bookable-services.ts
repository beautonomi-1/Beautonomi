import type { ServiceItem } from "@/lib/provider-portal/types";

/** Offerings bookable as appointment service lines (not add-on catalog rows). */
export function isBookableCatalogService(
  service: Pick<ServiceItem, "service_type" | "parent_service_id">,
): boolean {
  if (service.service_type === "addon" || service.service_type === "variant") return false;
  if (service.parent_service_id) return false;
  return true;
}
