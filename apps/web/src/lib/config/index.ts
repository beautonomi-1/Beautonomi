/**
 * Server-only Config Service — composes safe configuration across sources.
 * Never returns secret keys; all shapes are whitelisted.
 */

import { createHash } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type {
  PublicConfigBundle,
  GetPublicConfigBundleParams,
  ResolveFlagsForUserParams,
  ResolvedFlag,
  SafeAmplitudeConfig,
  SafeThirdPartyConfig,
  SafeBrandingConfig,
  SafeOnDemandModuleConfig,
  SafeAiModuleConfig,
  SafeAdsModuleConfig,
  SafeRankingModuleConfig,
  SafeDistanceModuleConfig,
  SafeSumsubModuleConfig,
  SafeAuraModuleConfig,
} from "./types";

const DEFAULT_AMPLITUDE: SafeAmplitudeConfig = {
  api_key_public: null,
  environment: "production",
  enabled_client_portal: false,
  enabled_provider_portal: false,
  enabled_admin_portal: false,
  guides_enabled: false,
  surveys_enabled: false,
  sampling_rate: 1,
  debug_mode: false,
};

const DEFAULT_BRANDING: SafeBrandingConfig = {
  site_name: "Beautonomi",
  logo_url: "/images/logo.svg",
  favicon_url: "/favicon.ico",
  primary_color: "#FF0077",
  secondary_color: "#D60565",
};

const DEFAULT_ON_DEMAND: SafeOnDemandModuleConfig = {
  enabled: false,
  ringtone_asset_path: null,
  ring_duration_seconds: 20,
  ring_repeat: true,
  waiting_screen_timeout_seconds: 45,
  provider_accept_window_seconds: 30,
  ui_copy: {},
};

const DEFAULT_AI_MODULE: SafeAiModuleConfig = {
  enabled: false,
  sampling_rate: 0,
  cache_ttl_seconds: 86400,
  default_model_tier: "cheap",
  max_tokens: 600,
  temperature: 0.3,
  daily_budget_credits: 0,
  per_provider_calls_per_day: 0,
  per_user_calls_per_day: 0,
};

/**
 * Deterministic rollout: hash(userId + flagKey) -> 0..99; compare to rollout_percent.
 * Superadmin always passes. If userId missing, treat as 0 unless enabled and platform-wide public allowed.
 */
export function resolveFlagsForUser(params: ResolveFlagsForUserParams): Record<string, ResolvedFlag> {
  const { flags, userId, role, platform, appVersion, environment } = params;
  const result: Record<string, ResolvedFlag> = {};
  const isSuperadmin = role === "superadmin";

  for (const flag of flags) {
    let enabled = flag.enabled;

    if (!enabled) {
      result[flag.feature_key] = {
        enabled: false,
        rollout_percent: flag.rollout_percent ?? 100,
        platforms_allowed: flag.platforms_allowed ?? null,
        roles_allowed: flag.roles_allowed ?? null,
        min_app_version: flag.min_app_version ?? null,
        environments_allowed: flag.environments_allowed ?? null,
      };
      continue;
    }

    if (isSuperadmin) {
      result[flag.feature_key] = {
        enabled: true,
        rollout_percent: flag.rollout_percent ?? 100,
        platforms_allowed: flag.platforms_allowed ?? null,
        roles_allowed: flag.roles_allowed ?? null,
        min_app_version: flag.min_app_version ?? null,
        environments_allowed: flag.environments_allowed ?? null,
      };
      continue;
    }

    if (flag.platforms_allowed?.length && !flag.platforms_allowed.includes(platform)) {
      enabled = false;
    }
    if (flag.roles_allowed?.length && role && !flag.roles_allowed.includes(role)) {
      enabled = false;
    }
    if (flag.environments_allowed?.length && !flag.environments_allowed.includes(environment)) {
      enabled = false;
    }
    if (flag.min_app_version && appVersion) {
      if (compareSemver(appVersion, flag.min_app_version) < 0) {
        enabled = false;
      }
    }

    if (enabled && (flag.rollout_percent ?? 100) < 100) {
      if (!userId) {
        enabled = false;
      } else {
        const bucket = hashToBucket(userId, flag.feature_key);
        if (bucket >= (flag.rollout_percent ?? 0)) {
          enabled = false;
        }
      }
    }

    result[flag.feature_key] = {
      enabled,
      rollout_percent: flag.rollout_percent ?? 100,
      platforms_allowed: flag.platforms_allowed ?? null,
      roles_allowed: flag.roles_allowed ?? null,
      min_app_version: flag.min_app_version ?? null,
      environments_allowed: flag.environments_allowed ?? null,
    };
  }

  return result;
}

function hashToBucket(userId: string, flagKey: string): number {
  const h = createHash("sha256").update(`${userId}:${flagKey}`).digest("hex");
  const n = parseInt(h.slice(0, 8), 16);
  return n % 100;
}

function compareSemver(a: string, b: string): number {
  const pa = a.split(".").map((x) => parseInt(x, 10) || 0);
  const pb = b.split(".").map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const va = pa[i] ?? 0;
    const vb = pb[i] ?? 0;
    if (va !== vb) return va - vb;
  }
  return 0;
}

/**
 * Load and return the full public config bundle. No secrets.
 */
export async function getPublicConfigBundle(params: GetPublicConfigBundleParams): Promise<PublicConfigBundle> {
  const {
    platform,
    environment,
    appVersion = null,
    role = null,
    userId = null,
  } = params;

  const supabase = getSupabaseAdmin();
  const fetched_at = new Date().toISOString();

  const results = await Promise.allSettled([
    supabase.from("amplitude_integration_config").select("api_key_public, environment, enabled_client_portal, enabled_provider_portal, enabled_admin_portal, guides_enabled, surveys_enabled, sampling_rate, debug_mode").eq("environment", environment).maybeSingle(),
    supabase.from("platform_settings").select("settings").eq("is_active", true).limit(1).maybeSingle(),
    supabase.from("feature_flags").select("feature_key, enabled, rollout_percent, platforms_allowed, roles_allowed, min_app_version, environments_allowed"),
    supabase.from("on_demand_module_config").select("*").eq("environment", environment).maybeSingle(),
    supabase.from("ai_module_config").select("*").eq("environment", environment).maybeSingle(),
    supabase.from("ads_module_config").select("*").eq("environment", environment).maybeSingle(),
    supabase.from("ranking_module_config").select("*").eq("environment", environment).maybeSingle(),
    supabase.from("distance_module_config").select("*").eq("environment", environment).maybeSingle(),
    supabase.from("sumsub_integration_config").select("enabled, level_name").eq("environment", environment).maybeSingle(),
    supabase.from("aura_integration_config").select("enabled").eq("environment", environment).maybeSingle(),
  ]);

  const amplitudeRes = results[0].status === "fulfilled" ? results[0].value : { data: null, error: new Error("failed") };
  const platformSettingsRes = results[1].status === "fulfilled" ? results[1].value : { data: null, error: null };
  const featureFlagsRes = results[2].status === "fulfilled" ? results[2].value : { data: [], error: null };
  const onDemandRes = results[3].status === "fulfilled" ? results[3].value : { data: null, error: null };
  const aiModuleRes = results[4].status === "fulfilled" ? results[4].value : { data: null, error: null };
  const adsRes = results[5].status === "fulfilled" ? results[5].value : { data: null, error: null };
  const rankingRes = results[6].status === "fulfilled" ? results[6].value : { data: null, error: null };
  const distanceRes = results[7].status === "fulfilled" ? results[7].value : { data: null, error: null };
  const sumsubRes = results[8].status === "fulfilled" ? results[8].value : { data: null, error: null };
  const auraRes = results[9].status === "fulfilled" ? results[9].value : { data: null, error: null };

  const amplitude: SafeAmplitudeConfig = amplitudeRes.data
    ? {
        api_key_public: amplitudeRes.data.api_key_public ?? null,
        environment: amplitudeRes.data.environment ?? environment,
        enabled_client_portal: amplitudeRes.data.enabled_client_portal ?? false,
        enabled_provider_portal: amplitudeRes.data.enabled_provider_portal ?? false,
        enabled_admin_portal: amplitudeRes.data.enabled_admin_portal ?? false,
        guides_enabled: amplitudeRes.data.guides_enabled ?? false,
        surveys_enabled: amplitudeRes.data.surveys_enabled ?? false,
        sampling_rate: Number(amplitudeRes.data.sampling_rate ?? 1),
        debug_mode: amplitudeRes.data.debug_mode ?? false,
      }
    : { ...DEFAULT_AMPLITUDE, environment };

  const settings = (platformSettingsRes.data as { settings?: Record<string, unknown> } | null)?.settings;
  const third_party: SafeThirdPartyConfig = {};
  if (settings?.onesignal && (settings.onesignal as { enabled?: boolean }).enabled) {
    const o = settings.onesignal as { app_id?: string; safari_web_id?: string };
    third_party.onesignal = { enabled: true, app_id: o.app_id, safari_web_id: o.safari_web_id };
  }
  if (settings?.mapbox && (settings.mapbox as { enabled?: boolean }).enabled) {
    const m = settings.mapbox as { public_token?: string };
    third_party.mapbox = { enabled: true, public_token: m.public_token };
  }

  const branding: SafeBrandingConfig = settings?.branding
    ? {
        site_name: (settings.branding as SafeBrandingConfig).site_name ?? DEFAULT_BRANDING.site_name,
        logo_url: (settings.branding as SafeBrandingConfig).logo_url ?? DEFAULT_BRANDING.logo_url,
        favicon_url: (settings.branding as SafeBrandingConfig).favicon_url ?? DEFAULT_BRANDING.favicon_url,
        primary_color: (settings.branding as SafeBrandingConfig).primary_color ?? DEFAULT_BRANDING.primary_color,
        secondary_color: (settings.branding as SafeBrandingConfig).secondary_color ?? DEFAULT_BRANDING.secondary_color,
      }
    : DEFAULT_BRANDING;

  const rawFlags = (featureFlagsRes.data ?? []) as Array<{
    feature_key: string;
    enabled: boolean;
    rollout_percent?: number | null;
    platforms_allowed?: string[] | null;
    roles_allowed?: string[] | null;
    min_app_version?: string | null;
    environments_allowed?: string[] | null;
  }>;
  const flags = resolveFlagsForUser({
    flags: rawFlags,
    userId,
    role,
    platform,
    appVersion,
    environment,
  });

  const onDemandRow = onDemandRes.data as Record<string, unknown> | null;
  const on_demand: SafeOnDemandModuleConfig = onDemandRow
    ? {
        enabled: Boolean(onDemandRow.enabled),
        ringtone_asset_path: (onDemandRow.ringtone_asset_path as string) ?? null,
        ring_duration_seconds: Number(onDemandRow.ring_duration_seconds ?? 20),
        ring_repeat: Boolean(onDemandRow.ring_repeat ?? true),
        waiting_screen_timeout_seconds: Number(onDemandRow.waiting_screen_timeout_seconds ?? 45),
        provider_accept_window_seconds: Number(onDemandRow.provider_accept_window_seconds ?? 30),
        ui_copy: (typeof onDemandRow.ui_copy === "object" && onDemandRow.ui_copy !== null ? onDemandRow.ui_copy : {}) as Record<string, unknown>,
      }
    : DEFAULT_ON_DEMAND;

  const aiRow = aiModuleRes.data as Record<string, unknown> | null;
  const ai: SafeAiModuleConfig = aiRow
    ? {
        enabled: Boolean(aiRow.enabled),
        sampling_rate: Number(aiRow.sampling_rate ?? 0),
        cache_ttl_seconds: Number(aiRow.cache_ttl_seconds ?? 86400),
        default_model_tier: String(aiRow.default_model_tier ?? "cheap"),
        max_tokens: Number(aiRow.max_tokens ?? 600),
        temperature: Number(aiRow.temperature ?? 0.3),
        daily_budget_credits: Number(aiRow.daily_budget_credits ?? 0),
        per_provider_calls_per_day: Number(aiRow.per_provider_calls_per_day ?? 0),
        per_user_calls_per_day: Number(aiRow.per_user_calls_per_day ?? 0),
      }
    : DEFAULT_AI_MODULE;

  const adsRow = adsRes.data as Record<string, unknown> | null;
  const ads: SafeAdsModuleConfig = adsRow
    ? {
        enabled: Boolean(adsRow.enabled),
        model: (adsRow.model as string) ?? null,
        disclosure_label: (adsRow.disclosure_label as string) ?? null,
        max_sponsored_slots: (adsRow.max_sponsored_slots as number) ?? null,
      }
    : { enabled: false };

  const rankingRow = rankingRes.data as Record<string, unknown> | null;
  const ranking: SafeRankingModuleConfig = rankingRow
    ? {
        enabled: Boolean(rankingRow.enabled),
        weights: (typeof rankingRow.weights === "object" && rankingRow.weights !== null ? rankingRow.weights : {}) as Record<string, unknown>,
      }
    : { enabled: false, weights: {} };

  const distanceRow = distanceRes.data as Record<string, unknown> | null;
  const distance: SafeDistanceModuleConfig = distanceRow
    ? {
        enabled: Boolean(distanceRow.enabled),
        default_radius_km: (distanceRow.default_radius_km as number) ?? null,
        max_radius_km: (distanceRow.max_radius_km as number) ?? null,
        step_km: (distanceRow.step_km as number) ?? null,
      }
    : { enabled: false };

  const sumsubRow = sumsubRes.data as Record<string, unknown> | null;
  const sumsub: SafeSumsubModuleConfig = sumsubRow
    ? { enabled: Boolean(sumsubRow.enabled), level_name: (sumsubRow.level_name as string) ?? null }
    : { enabled: false };

  const auraRow = auraRes.data as Record<string, unknown> | null;
  const aura: SafeAuraModuleConfig = auraRow ? { enabled: Boolean(auraRow.enabled) } : { enabled: false };

  return {
    meta: {
      env: environment,
      platform,
      version: appVersion ?? null,
      fetched_at,
    },
    amplitude,
    third_party,
    branding,
    flags,
    modules: {
      on_demand,
      ai,
      ads,
      ranking,
      distance,
      sumsub,
      aura,
    },
  };
}
