/**
 * Fetch config bundle from backend. Uses backend URL – no auth required for public bundle.
 * On Expo web at localhost:8081/8082 (or when APP_URL unset) we use http://localhost:3000.
 */
import {
  getBackendUrl,
  withWebApiTenantHeaders,
  DEFAULT_REGION_CURRENCY,
  MOBILE_WEB_USER_AGENT_TOKEN,
} from "@/config/public-env";
import { getDeviceLocaleCountryIso } from "@/lib/device-default-country-dial";
import { getShopMarketHeaderSync } from "@/lib/market/shop-market-opt-in";

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
  tenant_settings_overlay?: Record<string, unknown>;
  tenant_region?: {
    code: string;
    name: string;
    default_currency: string;
    default_language: string;
    timezone: string;
    phone_country_code: string;
    supported_languages?: string[];
    region_id?: string;
  };
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
  required_for_providers: boolean;
  required_for_payouts?: boolean;
  required_for_customers?: boolean;
  cross_validate?: boolean;
  min_age?: number;
}

export const DEFAULT_VERIFICATION_POLICY: PublicVerificationPolicy = {
  required_for_providers: false,
  required_for_payouts: false,
};

export interface PublicContentSafetyPolicy {
  social_min_age?: number;
  social_age_gate_mode?: "off" | "log" | "enforce";
  controls_enabled?: boolean;
}

export const DEFAULT_CONTENT_SAFETY_POLICY: PublicContentSafetyPolicy = {
  social_min_age: 13,
  social_age_gate_mode: "enforce",
  controls_enabled: true,
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
    /** @deprecated use identity_verification */
    sumsub?: Record<string, unknown>;
    identity_verification: Record<string, unknown>;
    aura: Record<string, unknown>;
    safety: Record<string, unknown>;
  };
  verification?: PublicVerificationPolicy;
  content_safety?: PublicContentSafetyPolicy;
  /** True when the network fetch failed — flags must not be trusted. */
  isStub?: boolean;
}

let cached: PublicConfigBundle | null = null;
let cacheTime = 0;
export const CONFIG_BUNDLE_CACHE_MS = 30 * 60 * 1000; // 30 min — foreground listeners refresh stale data

function createStubBundle(
  environment: Environment,
  platform: Platform,
): PublicConfigBundle {
  return {
    isStub: true,
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
      identity_verification: {},
      aura: {},
      safety: {},
    },
    verification: { ...DEFAULT_VERIFICATION_POLICY },
    content_safety: { ...DEFAULT_CONTENT_SAFETY_POLICY },
  };
}

export function isConfigBundleStub(bundle: PublicConfigBundle | null | undefined): boolean {
  return bundle?.isStub === true;
}

export function isConfigBundleCacheFresh(): boolean {
  return cached != null && !isConfigBundleStub(cached) && Date.now() - cacheTime < CONFIG_BUNDLE_CACHE_MS;
}

export async function fetchConfigBundle(params?: {
  platform?: Platform;
  environment?: Environment;
  appVersion?: string | null;
}): Promise<PublicConfigBundle> {
  const platform = params?.platform ?? "provider";
  const environment = params?.environment ?? (__DEV__ ? "development" : "production");
  if (isConfigBundleCacheFresh()) {
    return cached as PublicConfigBundle;
  }
  const base = getBackendUrl().replace(/\/$/, "");
  if (!base) {
    return createStubBundle(environment, platform);
  }
  const url = `${base}/api/public/config-bundle?platform=${platform}&environment=${environment}`;
  try {
    const res = await fetch(
      url,
      withWebApiTenantHeaders({
        headers: {
          "X-Active-Market-Country": getDeviceLocaleCountryIso(),
          ...getShopMarketHeaderSync(),
          "User-Agent": MOBILE_WEB_USER_AGENT_TOKEN,
        },
      }),
    );
    if (!res.ok) {
      return createStubBundle(environment, platform);
    }
    const data = (await res.json()) as PublicConfigBundle;
    if (data?.meta) {
      cached = { ...data, isStub: false };
      cacheTime = Date.now();
      return cached;
    }
  } catch {
    // fallback below — do not cache
  }
  return createStubBundle(environment, platform);
}

export function getCachedConfigBundle(): PublicConfigBundle | null {
  return cached;
}

export function getTenantDefaultCurrency(): string {
  const fromBundle = getCachedConfigBundle()?.meta?.tenant_region?.default_currency?.trim();
  if (fromBundle) return fromBundle;
  return DEFAULT_REGION_CURRENCY;
}

export function getTenantRegionCode(): string {
  const fromBundle = getCachedConfigBundle()?.meta?.tenant_region?.code?.trim();
  if (fromBundle) return fromBundle.toUpperCase();
  return "ZA";
}

export function clearConfigBundleCache(): void {
  cached = null;
  cacheTime = 0;
}
