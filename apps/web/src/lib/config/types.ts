/**
 * Control Plane config types — safe, whitelisted shapes only.
 * Never expose secret keys or server-only fields.
 */

export type Platform = "web" | "customer" | "provider";
export type Environment = "production" | "staging" | "development";

export interface ConfigBundleMeta {
  env: Environment;
  platform: Platform;
  version: string | null;
  fetched_at: string;
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
  waiting_screen_timeout_seconds: number;
  provider_accept_window_seconds: number;
  ui_copy: Record<string, unknown>;
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
  weights: Record<string, unknown>;
}

export interface SafeDistanceModuleConfig {
  enabled: boolean;
  default_radius_km?: number | null;
  max_radius_km?: number | null;
  step_km?: number | null;
}

export interface SafeSumsubModuleConfig {
  enabled: boolean;
  level_name?: string | null;
}

export interface SafeAuraModuleConfig {
  enabled: boolean;
}

export interface SafeSafetyModuleConfig {
  enabled: boolean;
  check_in_enabled: boolean;
  escalation_enabled: boolean;
  cooldown_seconds: number;
  ui_copy: Record<string, unknown>;
}

export interface PublicConfigBundle {
  meta: ConfigBundleMeta;
  amplitude: SafeAmplitudeConfig;
  third_party: SafeThirdPartyConfig;
  branding: SafeBrandingConfig;
  flags: Record<string, ResolvedFlag>;
  modules: {
    on_demand: SafeOnDemandModuleConfig;
    ai: SafeAiModuleConfig;
    ads: SafeAdsModuleConfig;
    ranking: SafeRankingModuleConfig;
    distance: SafeDistanceModuleConfig;
    sumsub: SafeSumsubModuleConfig;
    aura: SafeAuraModuleConfig;
    safety: SafeSafetyModuleConfig;
  };
}

export interface GetPublicConfigBundleParams {
  platform: Platform;
  environment: Environment;
  appVersion?: string | null;
  role?: string | null;
  userId?: string | null;
  providerId?: string | null;
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
