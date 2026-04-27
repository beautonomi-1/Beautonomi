/**
 * Appends `location_id` to provider report API URLs for parity with the
 * global provider portal location filter.
 */
export function addLocationIdToUrl(
  path: string,
  locationId: string | null | undefined
): string {
  if (!locationId) return path;
  const hasQuery = path.includes("?");
  return `${path}${hasQuery ? "&" : "?"}location_id=${encodeURIComponent(locationId)}`;
}
