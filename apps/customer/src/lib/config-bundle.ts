/**
 * Fetch config bundle from backend (customer app). Uses getBackendUrl() – no auth required for public bundle.
 */
import { getBackendUrl, withWebApiTenantHeaders, DEFAULT_REGION_CURRENCY } from "@/config/public-env";
import { getDeviceRegionCountryIso } from "@/lib/device-default-country-dial";

export type Platform = "web" | "customer" | "provider";
export type Environment = "production" | "staging" | "development";

export interface ConfigBundleMeta {
  env: Environment;
  platform: Platform;
  version: string | null;
  fetched_at: string;
  active_market_country?: string;
  active_market_source?: string;
  tenant_id?: string;
  tenant_slug?: string;
  /** Shallow overlay from tenant_settings (public-safe keys only). */
  tenant_settings_overlay?: Record<string, unknown>;
  /** Resolved from tenants + iso_countries + regions via /api/public/config-bundle */
  tenant_region?: {
    code: string;
    name: string;
    default_currency: string;
    default_language: string;
    timezone: string;
    phone_country_code: string;
    region_id?: string;
  };
  /** Allowlisted subset of region_settings (support URLs, paystack_public_key, etc.). */
  region_settings_public?: Record<string, unknown>;
}

export interface ResolvedFlag {
  enabled: boolean;
  rollout_percent?: number;
  platforms_allowed?: string[] | null;
  roles_allowed?: string[] | null;
  min_app_version?: string | null;
  environments_allowed?: string[] | null;
}

/** Aligned with `platform_settings.settings.auth` (config bundle / admin). */
export interface PublicAuthPolicy {
  email_provider_enabled: boolean;
  secure_email_change: boolean;
  secure_password_change: boolean;
  require_current_password: boolean;
  prevent_leaked_passwords: boolean;
  minimum_password_length: number;
  password_requirements: "none" | "letters_and_digits" | "lowercase_uppercase_number";
  email_otp_expiration_seconds: number;
  email_otp_length: number;
  phone_provider_enabled: boolean;
  phone_confirmations_enabled: boolean;
  sms_provider: "twilio";
  sms_otp_expiration_seconds: number;
  sms_otp_length: number;
}

export const DEFAULT_AUTH: PublicAuthPolicy = {
  email_provider_enabled: true,
  secure_email_change: true,
  secure_password_change: true,
  require_current_password: true,
  prevent_leaked_passwords: true,
  minimum_password_length: 8,
  password_requirements: "none",
  email_otp_expiration_seconds: 3600,
  email_otp_length: 6,
  phone_provider_enabled: true,
  phone_confirmations_enabled: true,
  sms_provider: "twilio",
  sms_otp_expiration_seconds: 120,
  sms_otp_length: 6,
};

export interface OnDemandModuleConfig {
  enabled: boolean;
  ringtone_asset_path: string | null;
  ring_duration_seconds: number;
  ring_repeat: boolean;
  normal_booking_ringtone_asset_path: string | null;
  normal_booking_ring_duration_seconds: number;
  normal_booking_ring_repeat: boolean;
  waiting_screen_timeout_seconds: number;
  provider_accept_window_seconds: number;
  ui_copy: Record<string, unknown>;
}

export interface PublicVerificationPolicy {
  mode?: "off" | "manual" | "didit" | "both";
  didit_enabled?: boolean;
  manual_enabled?: boolean;
  required_for_providers?: boolean;
  required_for_payouts?: boolean;
  required_for_customers?: boolean;
  cross_validate?: boolean;
  min_age?: number;
}

export const DEFAULT_VERIFICATION_POLICY: PublicVerificationPolicy = {
  required_for_customers: false,
};

export interface PublicConfigBundle {
  meta: ConfigBundleMeta;
  amplitude: Record<string, unknown>;
  third_party: Record<string, unknown>;
  branding: Record<string, unknown>;
  auth: PublicAuthPolicy;
  flags: Record<string, ResolvedFlag>;
  modules: {
    on_demand: OnDemandModuleConfig;
    ai: Record<string, unknown>;
    ads: Record<string, unknown>;
    ranking: Record<string, unknown>;
    distance: Record<string, unknown>;
    /** @deprecated use identity_verification */
    sumsub?: Record<string, unknown>;
    identity_verification: Record<string, unknown>;
    aura: Record<string, unknown>;
    safety: Record<string, unknown>;
  };
  verification?: PublicVerificationPolicy;
}

let cached: PublicConfigBundle | null = null;
let cacheTime = 0;
const CACHE_MS = 30 * 60 * 1000; // 30 min — foreground listeners still refresh stale data

function defaultStubBundle(environment: Environment, platform: Platform): PublicConfigBundle {
  return {
    meta: { env: environment, platform, version: null, fetched_at: new Date().toISOString() },
    amplitude: {},
    third_party: {},
    branding: {},
    auth: { ...DEFAULT_AUTH },
    flags: {},
    modules: {
      on_demand: {
        enabled: false,
        ringtone_asset_path: null,
        ring_duration_seconds: 20,
        ring_repeat: true,
        normal_booking_ringtone_asset_path: null,
        normal_booking_ring_duration_seconds: 20,
        normal_booking_ring_repeat: true,
        waiting_screen_timeout_seconds: 45,
        provider_accept_window_seconds: 30,
        ui_copy: {},
      },
      ai: {},
      ads: {},
      ranking: {},
      distance: {},
      identity_verification: {},
      aura: {},
      safety: {},
    },
    verification: { ...DEFAULT_VERIFICATION_POLICY },
  };
}

export async function fetchConfigBundle(params?: {
  platform?: Platform;
  environment?: Environment;
  appVersion?: string | null;
}): Promise<PublicConfigBundle> {
  const platform = params?.platform ?? "customer";
  const environment = params?.environment ?? (__DEV__ ? "development" : "production");
  if (cached && Date.now() - cacheTime < CACHE_MS) return cached;
  const base = getBackendUrl();
  if (!base) {
    cached = defaultStubBundle(environment, platform);
    cacheTime = Date.now();
    return cached as PublicConfigBundle;
  }
  const url = `${base.replace(/\/$/, "")}/api/public/config-bundle?platform=${platform}&environment=${environment}`;
  try {
    const res = await fetch(
      url,
      withWebApiTenantHeaders({
        headers: { "X-Active-Market-Country": getDeviceRegionCountryIso() },
      }),
    );
    const data = (await res.json()) as PublicConfigBundle;
    if (data?.meta) {
      cached = data;
      cacheTime = Date.now();
      return data;
    }
  } catch {
    // fallback
  }
  cached = defaultStubBundle(environment, platform);
  cacheTime = Date.now();
  return cached as PublicConfigBundle;
}

export function getCachedConfigBundle(): PublicConfigBundle | null {
  return cached;
}

/**
 * Default ISO 4217 code for the active **tenant / market** (remote config bundle, then
 * `EXPO_PUBLIC_DEFAULT_REGION_CURRENCY`, then ZAR).
 *
 * **Product expectation (not a wiring bug):** Most price labels and fallbacks use this value because they reflect
 * the active market’s catalog and checkout rules. Saving **Currency** under Account → Language & region persists
 * `preferred_currency` on the user profile for APIs and future UX, but individual screens do **not** automatically
 * switch every amount to that preference unless they opt in — e.g. via `useCustomerDisplayCurrency()` in
 * `@/hooks/useCustomerDisplayCurrency` (or by reading `preferred_currency` from `/api/me/profile`).
 */
export function getTenantDefaultCurrency(): string {
  const fromBundle = getCachedConfigBundle()?.meta?.tenant_region?.default_currency?.trim();
  if (fromBundle) return fromBundle;
  return DEFAULT_REGION_CURRENCY;
}

export function clearConfigBundleCache(): void {
  cached = null;
  cacheTime = 0;
}
