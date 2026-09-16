/**
 * In-SPA targets for global search (`BrowserRouter` basename `/admin`).
 * Leading `/` required so links are not resolved relative to the current route.
 */
export function adminSearchResultSpaPath(
  kind: "user" | "booking" | "provider" | "lead" | "onboarding_draft",
  id: string,
): string {
  switch (kind) {
    case "user":
      return `/users/${id}`;
    case "booking":
      return `/bookings/${id}`;
    case "provider":
      return `/providers/${id}`;
    case "lead":
      return `/provider-ops/leads/${id}`;
    case "onboarding_draft":
      return `/provider-ops/tracker/${id}`;
  }
}
