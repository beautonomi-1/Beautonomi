import type { Address } from "./index";

function norm(s: string): string {
  return s.trim().toLowerCase();
}

/** Line2 is often a unit/apartment, not a suburb — do not use it for courier suburb rates. */
export function line2LooksLikeUnitOrSuite(line2: string): boolean {
  const t = line2.trim();
  if (!t) return false;
  return /^(unit|apt|apartment|suite|floor|fl\.?|#|block|blk|shop|office)\b/i.test(t);
}

/**
 * ShipLogic / Bob Go v2 suburb for rating. There is no dedicated suburb column in our DB;
 * we store Mapbox neighborhood in `address_line2` when it differs from the metro `city`.
 */
export function resolveCourierSuburb(address: Address): string {
  const city = address.city.trim();
  const line2 = address.line2?.trim() ?? "";
  if (!line2 || norm(line2) === norm(city) || line2LooksLikeUnitOrSuite(line2)) {
    return city;
  }
  return line2;
}

export function resolveShiplogicLocalArea(address: Address): string {
  const suburb = resolveCourierSuburb(address);
  const line2 = address.line2?.trim() ?? "";
  if (line2 && line2LooksLikeUnitOrSuite(line2)) {
    return suburb;
  }
  return line2 || suburb;
}

export function toShiplogicApiLocality(address: Address): { suburb: string; local_area: string; city: string } {
  const city = address.city.trim();
  return {
    city,
    suburb: resolveCourierSuburb(address),
    local_area: resolveShiplogicLocalArea(address),
  };
}
