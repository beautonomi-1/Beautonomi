/**
 * Control Plane config types — safe, whitelisted shapes only.
 * Never expose secret keys or server-only fields.
 */

import type { PublicAuthPolicy } from "./auth-policy-public";

export type { PublicAuthPolicy } from "./auth-policy-public";

export type Platform = "web" | "customer" | "provider";
export type Environment = "production" | "staging" | "development";

/** When `meta.tenant_region` is present, these fields are required (web + mobile parity). */
export interface TenantRegionMeta {
  code: string;
  name: string;
  default_currency: string;
  default_language: string;
  timezone: string;
  phone_country_code: string;
  /** `public.regions.id` when migration 377 is applied and region_code matches. */
  region_id?: string;
}

/** Stable list for contract tests — keep in sync with `TenantRegionMeta` required fields. */
export const TENANT_REGION_META_KEYS = [
  "code",
  "name",
  "default_currency",
  "default_language",
  "timezone",
  "phone_country_code",
] as const satisfies readonly (keyof TenantRegionMeta)[];

export interface ConfigBundleMeta {
  env: Environment;
  platform: Platform;
  version: string | null;
  fetched_at: string;
  /** ISO 3166-1 alpha-2 — resolved from Host / headers / geo (spec §11.6 discovery). */
  active_market_country?: string;
  active_market_source?: "query" | "host" | "header_hint" | "geo_header" | "default";
  /** DB tenant when Host maps to tenant_domains (spec §6). */
  tenant_id?: string;
  tenant_slug?: string;
  /** Shallow overlay from tenant_settings.settings (public-safe keys only; server composes bundle). */
  tenant_settings_overlay?: Record<string, unknown>;
  /** Resolved region/market info for the active tenant (currency, locale, phone defaults). */
  tenant_region?: TenantRegionMeta;
  /**
   * Non-secret subset of `region_settings.settings` (allowlisted keys only; see getPublicConfigBundle).
   * Used for market-specific URLs/copy without exposing control-plane keys.
   */
  region_settings_public?: Record<string, unknown>;
}

export interface SafeAmplitudeConfig {
  api_key_public: string | null;
  environment: string;
  enabled_client_portal: boolean;
  enabled_provider_portal: boolean;
  enabled_admin_portal: boolean;
  guides_enabled: boolean;
  surveys_enabled: boolean;
  sampling_rate: number;
  debug_mode: boolean;
}

export interface SafeThirdPartyConfig {
  onesignal?: { enabled: boolean; app_id?: string; safari_web_id?: string };
  mapbox?: { enabled: boolean; public_token?: string };
}

export interface SafeBrandingConfig {
  site_name: string;
  logo_url: string;
  favicon_url: string;
  primary_color: string;
  secondary_color: string;
}

export interface ResolvedFlag {
  enabled: boolean;
  rollout_percent?: number;
  platforms_allowed?: string[] | null;
  roles_allowed?: string[] | null;
  min_app_version?: string | null;
  environments_allowed?: string[] | null;
}

export interface SafeOnDemandModuleConfig {
  enabled: boolean;
  ringtone_asset_path: string | null;
  ring_duration_seconds: number;
  ring_repeat: boolean;
  /** Standard booking realtime alert (provider app/web); app-assets path, signed URL. */
  normal_booking_ringtone_asset_path: string | null;
  normal_booking_ring_duration_seconds: number;
  normal_booking_ring_repeat: boolean;
  waiting_screen_timeout_seconds: number;
  provider_accept_window_seconds: number;
  ui_copy: Record<string, any>;
}

export interface SafeAiModuleConfig {
  enabled: boolean;
  sampling_rate: number;
  cache_ttl_seconds: number;
  default_model_tier: string;
  max_tokens: number;
  temperature: number;
  daily_budget_credits: number;
  per_provider_calls_per_day: number;
  per_user_calls_per_day: number;
}

export interface SafeAdsModuleConfig {
  enabled: boolean;
  model?: string | null;
  disclosure_label?: string | null;
  max_sponsored_slots?: number | null;
}

export interface SafeRankingModuleConfig {
  enabled: boolean;
  weights: Record<string, any>;
}

export interface SafeDistanceModuleConfig {
  enabled: boolean;
  default_radius_km?: number | null;
  max_radius_km?: number | null;
  step_km?: number | null;
}

/** @deprecated Use SafeIdentityVerificationModuleConfig */
export interface SafeSumsubModuleConfig {
  enabled: boolean;
  level_name?: string | null;
}

export interface SafeIdentityVerificationModuleConfig {
  enabled: boolean;
  provider: "didit" | "none";
}

export interface SafeVerificationPolicy {
  mode: "off" | "manual" | "didit" | "both";
  /** @deprecated Always false after Didit migration. Use didit_enabled. */
  sumsub_enabled: boolean;
  didit_enabled: boolean;
  manual_enabled: boolean;
  required_for_providers: boolean;
  required_for_payouts: boolean;
  required_for_customers: boolean;
  cross_validate: boolean;
  min_age: number;
  kyb_enabled: boolean;
  kyb_required_for_business: boolean;
}

export interface SafeAuraModuleConfig {
  enabled: boolean;
}

export interface SafeSafetyModuleConfig {
  enabled: boolean;
  check_in_enabled: boolean;
  escalation_enabled: boolean;
  cooldown_seconds: number;
  ui_copy: Record<string, any>;
}

export interface PublicConfigBundle {
  meta: ConfigBundleMeta;
  amplitude: SafeAmplitudeConfig;
  third_party: SafeThirdPartyConfig;
  branding: SafeBrandingConfig;
  /**
   * Supabase / platform email policy (from `platform_settings.settings.auth`);
   * drives public login + account copy when clients refresh the bundle.
   */
  auth: PublicAuthPolicy;
  flags: Record<string, ResolvedFlag>;
  modules: {
    on_demand: SafeOnDemandModuleConfig;
    ai: SafeAiModuleConfig;
    ads: SafeAdsModuleConfig;
    ranking: SafeRankingModuleConfig;
    distance: SafeDistanceModuleConfig;
    /** @deprecated Use identity_verification */
    sumsub: SafeSumsubModuleConfig;
    identity_verification: SafeIdentityVerificationModuleConfig;
    aura: SafeAuraModuleConfig;
    safety: SafeSafetyModuleConfig;
  };
  /**
   * Tenant-aware verification policy snapshot.
   * Clients should treat the per-request API (/api/me/identity-verification/status)
   * as authoritative; this bundle field is provided for cold-start screens.
   */
  verification: SafeVerificationPolicy;
}

export interface GetPublicConfigBundleParams {
  platform: Platform;
  environment: Environment;
  appVersion?: string | null;
  role?: string | null;
  userId?: string | null;
  providerId?: string | null;
  /** When set, merges tenant_settings.settings into bundle meta (§20). */
  tenantId?: string | null;
}

export interface ResolveFlagsForUserParams {
  flags: Array<{
    feature_key: string;
    enabled: boolean;
    rollout_percent?: number | null;
    platforms_allowed?: string[] | null;
    roles_allowed?: string[] | null;
    min_app_version?: string | null;
    environments_allowed?: string[] | null;
  }>;
  userId: string | null;
  role: string | null;
  platform: Platform;
  appVersion: string | null;
  environment: Environment;
}
