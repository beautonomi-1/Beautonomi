/**
 * Map web `/booking?...` query params to native customer `/(app)/book` params.
 * Aliases web names (`service`, `staff`) to native (`service_id`, `staff_id`).
 */
export function mapBookingQueryToNativeBookPath(search: string): string | null {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  const params = new URLSearchParams(raw);
  const slug = params.get("slug")?.trim();
  if (!slug) return null;

  const out = new URLSearchParams();
  out.set("slug", slug);

  const service = (params.get("service") ?? params.get("service_id") ?? "").trim();
  const staff = (params.get("staff") ?? params.get("staff_id") ?? "").trim();
  const locationType = (params.get("location_type") ?? "").trim();
  if (service) out.set("service_id", service);
  if (staff) out.set("staff_id", staff);
  if (locationType) out.set("location_type", locationType);
  if (params.get("embed") === "1") out.set("embed", "1");

  const qs = out.toString();
  return qs ? `/(app)/book?${qs}` : "/(app)/book";
}
