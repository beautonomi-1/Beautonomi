/** Normalize `useApi` payloads from `/api/provider/packages` and `/api/provider/products`. */

export function normalizePackagesList(data: unknown): unknown[] {
  if (data == null) return [];
  if (Array.isArray(data)) return data;
  const o = data as { packages?: unknown; data?: { packages?: unknown } };
  const list = o.packages ?? o.data?.packages;
  return Array.isArray(list) ? list : [];
}

export function normalizeProductsList(data: unknown): unknown[] {
  if (data == null) return [];
  if (Array.isArray(data)) return data;
  const o = data as { products?: unknown };
  const list = o.products;
  return Array.isArray(list) ? list : [];
}
