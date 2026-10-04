/**
 * Canonical in-app web path for the unified `/booking` flow.
 */
export function buildWebBookingHref(
  slug: string,
  extra?: Record<string, string | null | undefined>,
): string {
  const params = new URLSearchParams();
  params.set("slug", slug);
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      if (typeof value === "string" && value.length > 0) {
        params.set(key, value);
      }
    }
  }
  return `/booking?${params.toString()}`;
}
