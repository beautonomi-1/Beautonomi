/**
 * In-SPA targets for global search (`BrowserRouter` basename `/admin`).
 * Leading `/` required so links are not resolved relative to the current route.
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
