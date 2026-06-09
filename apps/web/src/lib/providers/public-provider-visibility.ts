/**
 * Shared rules for which providers may appear on public discovery surfaces
 * (home, search, category browse, sitemap) and profile/detail pages.
 */

export const NON_PUBLIC_STATUSES = [
  "draft",
  "pending_approval",
  "suspended",
  "deactivated",
  "banned",
  "deleted",
] as const;

export type NonPublicProviderStatus = (typeof NON_PUBLIC_STATUSES)[number];

/** Provider row shape sufficient for visibility checks. */
export type ProviderVisibilityRow = {
  status?: string | null;
  deleted_at?: string | null;
};

/**
 * Chain `.eq("status", "active").is("deleted_at", null)` on a Supabase query builder.
 * Works with PostgREST query builders that support method chaining.
 */
export function applyPublicProviderVisibility<T extends {
  eq: (column: string, value: unknown) => T;
  is: (column: string, value: null) => T;
}>(query: T): T {
  return query.eq("status", "active").is("deleted_at", null);
}

/** True when a provider may be shown on any public customer surface. */
export function isProviderPubliclyVisible(
  row: ProviderVisibilityRow | null | undefined,
): boolean {
  if (!row) return false;
  if (row.deleted_at != null && String(row.deleted_at).trim() !== "") return false;
  const status = String(row.status ?? "").trim();
  if (!status || status !== "active") return false;
  return true;
}
