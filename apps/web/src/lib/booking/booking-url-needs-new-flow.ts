/**
 * Whether the booking URL should be handled by `OnlineBookingFlowNew` (`/book/[slug]`)
 * rather than the legacy `/booking` stack. Kept in sync with
 * `app/book/[providerSlug]/page.tsx` server redirect logic.
 */
export function bookingUrlNeedsOnlineBookingFlowNew(sp: { get: (key: string) => string | null }): boolean {
  if (sp.get("embed") === "1") return true;

  const servicesCsv = (sp.get("services") ?? "").trim();
  const services = servicesCsv.split(",").filter(Boolean);
  if (services.length > 1) return true;
  if ((sp.get("service") ?? "").trim()) return true;
  if ((sp.get("serviceId") ?? "").trim()) return true;
  if (servicesCsv.length > 0) return true;

  if ((sp.get("location") ?? "").trim() || (sp.get("location_type") ?? "").trim()) return true;

  if (
    (sp.get("addons") ?? "").trim() ||
    (sp.get("promo") ?? "").trim() ||
    (sp.get("gift_card") ?? "").trim() ||
    (sp.get("products") ?? "").trim()
  ) {
    return true;
  }

  if ((sp.get("staff") ?? "").trim()) return true;
  if ((sp.get("package") ?? "").trim() || (sp.get("package_id") ?? "").trim()) return true;
  if ((sp.get("date") ?? "").trim()) return true;
  if (sp.get("anyone") === "true") return true;
  if ((sp.get("auth_return") ?? "").trim()) return true;

  return false;
}
