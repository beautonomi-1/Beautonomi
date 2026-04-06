/**
 * In-SPA targets for global search (prefer SPA when route exists).
 */
export function adminSearchResultSpaPath(kind: "user" | "booking" | "provider", id: string): string {
  switch (kind) {
    case "user":
      return `/users/${id}`;
    case "booking":
      return `/bookings/${id}`;
    case "provider":
      return `/providers/${id}`;
  }
}
