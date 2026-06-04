export type TopServiceRow = {
  service_name: string;
  booking_count: number;
  total_revenue: number;
};

/** Unwrap top-services API: legacy array or `{ services: [...] }`. */
export function normalizeTopServicesPayload(data: unknown): TopServiceRow[] | null {
  if (!data) return null;
  if (Array.isArray(data)) return data as TopServiceRow[];
  if (typeof data === "object" && data !== null && "services" in data) {
    const services = (data as { services?: unknown }).services;
    if (Array.isArray(services)) return services as TopServiceRow[];
  }
  return null;
}
