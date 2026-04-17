/**
 * `fetcher` returns the full JSON body: `{ data: T, error: null }` (see fetchJson).
 * Helpers for common provider API payload shapes.
 */

export function unpackPackagesListPayload(body: unknown): unknown[] {
  if (!body || typeof body !== "object") return [];
  const inner = (body as { data?: { packages?: unknown } }).data;
  const list = inner && typeof inner === "object" ? inner.packages : undefined;
  return Array.isArray(list) ? list : [];
}

export function unpackPackageDetailPayload(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== "object") return null;
  const d = (body as { data?: { package?: unknown } }).data;
  const pkg = d && typeof d === "object" ? (d as { package?: unknown }).package : undefined;
  return pkg && typeof pkg === "object" ? (pkg as Record<string, unknown>) : null;
}

export function unpackProductsListPayload(body: unknown): unknown[] {
  if (!body || typeof body !== "object") return [];
  const inner = (body as { data?: { products?: unknown } }).data;
  if (!inner || typeof inner !== "object") return [];
  const products = (inner as { products?: unknown }).products;
  return Array.isArray(products) ? products : [];
}
