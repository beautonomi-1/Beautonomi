/**
 * Paths that stay reachable when `public_site` maintenance is enabled (partner funnel + auth).
 * Used by `resolveWebMaintenanceFetch` in `maintenance-web-path-scope.ts`.
 *
 * Includes partner navbar destinations (e.g. `/pricing`, `/why-beautonomi` from become-a-partner).
 */
export { PUBLIC_SITE_MAINTENANCE_EXEMPT_PREFIXES } from "@beautonomi/maintenance-paths";
