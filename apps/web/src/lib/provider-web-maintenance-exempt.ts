/**
 * Under `/provider`, paths that stay reachable when `provider_web` maintenance is enabled
 * (onboarding, checkout, embed — partner funnel without the full logged-in portal).
 * Align with exceptions in `apps/web/src/app/provider/layout.tsx`.
 */
export { PROVIDER_WEB_MAINTENANCE_EXEMPT_PREFIXES } from "@beautonomi/maintenance-paths";
