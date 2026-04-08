/**
 * Shared package → cart prefill helpers (customer web, customer native, future surfaces).
 */

export type PublicPackageServiceLine = {
  id: string;
  title?: string;
  duration_minutes?: number;
  type?: string;
};

/** Flat row from `/api/services` (web legacy). */
export type ServicesCatalogRow = {
  id: string;
  title: string;
  duration: number;
  bufferMinutes?: number;
  price: number;
  currency: string;
  category: string;
};

export type PrefillBookingServiceRow = {
  id: string;
  title: string;
  duration: number;
  bufferMinutes: number;
  price: number;
  currency: string;
  staffId: string;
  staffName?: string;
};

/**
 * Match package service lines to a **flat** catalog (no variants). Returns null if any line is missing.
 * Prefer {@link resolvePackageOfferingsFromFlatMenu} when using `/api/public/providers/{slug}/services`.
 */
export function buildSelectedServicesFromPackageLines(
  packageLines: PublicPackageServiceLine[] | undefined | null,
  catalog: ServicesCatalogRow[]
): PrefillBookingServiceRow[] | null {
  if (!packageLines?.length || !catalog.length) return null;

  const byId = new Map(catalog.map((s) => [s.id, s]));
  const out: PrefillBookingServiceRow[] = [];

  for (const line of packageLines) {
    if (line.type && line.type !== "service") continue;
    const row = byId.get(line.id);
    if (!row) return null;
    out.push({
      id: row.id,
      title: row.title,
      duration: row.duration,
      bufferMinutes: row.bufferMinutes ?? 0,
      price: row.price,
      currency: row.currency,
      staffId: "any",
    });
  }

  if (out.length === 0) return null;
  return out;
}
