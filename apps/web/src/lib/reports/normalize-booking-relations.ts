/**
 * PostgREST embeds may surface as an object or a single-element array depending on typings.
 */

export function asSingleRelation<T extends Record<string, unknown>>(rel: unknown): T | undefined {
  if (rel == null) return undefined;
  const row = Array.isArray(rel) ? rel[0] : rel;
  if (typeof row !== "object" || row === null) return undefined;
  return row as T;
}

export type BookingServiceOffering = {
  id?: string;
  title?: string;
  service_type?: string;
};

export function offeringFromBookingService(bs: { offerings?: unknown }): BookingServiceOffering | undefined {
  return asSingleRelation<BookingServiceOffering>(bs.offerings);
}

export function bookingServiceLineIsPackage(bs: { offerings?: unknown }): boolean {
  return offeringFromBookingService(bs)?.service_type === "package";
}
