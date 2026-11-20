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
  const services = (params.get("services") ?? params.get("service_ids") ?? "").trim();
  const staff = (params.get("staff") ?? params.get("staff_id") ?? "").trim();
  const location = (params.get("location") ?? params.get("location_id") ?? "").trim();
  const locationType = (params.get("location_type") ?? "").trim();
  const holdId = (params.get("hold_id") ?? "").trim();
  const rebookOffer = (params.get("rebook_offer") ?? "").trim();
  const date = (params.get("date") ?? "").trim();
  const step = (params.get("step") ?? "").trim();
  if (service) out.set("service_id", service);
  if (services) out.set("service_ids", services);
  if (staff) out.set("staff_id", staff);
  if (location) out.set("location_id", location);
  if (locationType) out.set("location_type", locationType);
  if (holdId) out.set("hold_id", holdId);
  if (rebookOffer) out.set("rebook_offer", rebookOffer);
  if (date) out.set("date", date);
  if (step === "calendar") out.set("step", "time");
  else if (step) out.set("step", step);
  if (params.get("embed") === "1") out.set("embed", "1");

  const qs = out.toString();
  return qs ? `/(app)/book?${qs}` : "/(app)/book";
}
