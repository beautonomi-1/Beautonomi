/**
 * Global search result targets — matches `AdminShell.tsx` (Next admin) until SPA migrates
 * `/admin/users`, `/admin/bookings`, `/admin/providers` list pages.
 */
export function adminSearchResultLegacyPath(
  kind: "user" | "booking" | "provider",
  id: string
): string {
  const q = encodeURIComponent(id);
  switch (kind) {
    case "user":
      return `/admin/users?highlight=${q}`;
    case "booking":
      return `/admin/bookings?highlight=${q}`;
    case "provider":
      return `/admin/providers?highlight=${q}`;
  }
}
