/**
 * Maintenance / coming-soon feature: per-scope config and public API shape.
 * Stored in platform_settings.settings.maintenance[scope].
 */

export const MAINTENANCE_SCOPES = ["public_site", "provider_web", "customer_app", "provider_app"] as const;
export type MaintenanceScope = (typeof MAINTENANCE_SCOPES)[number];

export interface MaintenanceScopeConfig {
  enabled: boolean;
  title: string;
  message: string;
  /** Call-to-action button label (e.g. "Notify me when we're back") */
  cta_label?: string | null;
  /** ISO 8601 datetime (e.g. UTC); when set, show countdown until this time */
  countdown_end_at?: string | null;
  /** Optional label above the countdown (e.g. "Launching in") */
  countdown_label?: string | null;
  /**
   * `provider_web` only. When `true` (default), onboarding/embed/checkout paths stay reachable
   * while maintenance is on. When `false`, the entire `/provider` surface is gated (full outage).
   */
  allow_partner_funnel?: boolean;
}

/** Response shape for GET /api/public/maintenance?scope=... */
export interface PublicMaintenanceResponse {
  enabled: boolean;
  title: string;
  message: string;
  cta_label?: string | null;
  countdown_end_at?: string | null;
  countdown_label?: string | null;
  /** Present for `scope=provider_web`: whether funnel paths bypass maintenance when enabled. */
  allow_partner_funnel?: boolean;
}

export function defaultMaintenanceConfig(): MaintenanceScopeConfig {
  return {
    enabled: false,
    title: "We'll be back soon",
    message: "We're performing scheduled maintenance. Thank you for your patience.",
    cta_label: null,
    countdown_end_at: null,
    countdown_label: null,
  };
}

export function getDefaultMaintenance(): Record<MaintenanceScope, MaintenanceScopeConfig> {
  return {
    public_site: { ...defaultMaintenanceConfig() },
    provider_web: { ...defaultMaintenanceConfig(), allow_partner_funnel: true },
    customer_app: { ...defaultMaintenanceConfig() },
    provider_app: { ...defaultMaintenanceConfig() },
  };
}
