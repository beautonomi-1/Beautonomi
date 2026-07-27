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
    /** Primary online payment gateway for the region ("paystack" | "stripe" | ...). */
    payment_gateway?: string;
    /** Minimum native version supporting the region's gateway SDK (Stripe PaymentSheet). */
    gateway_native_min_version?: string;
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

export interface PublicContentSafetyPolicy {
  social_min_age?: number;
  social_age_gate_mode?: "off" | "log" | "enforce";
  controls_enabled?: boolean;
}

export const DEFAULT_CONTENT_SAFETY_POLICY: PublicContentSafetyPolicy = {
  social_min_age: 13,
  social_age_gate_mode: "log",
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
    distance: Record<string, unknown>;
    /** @deprecated use identity_verification */
    sumsub?: Record<string, unknown>;
    identity_verification: Record<string, unknown>;
    aura: Record<string, unknown>;
    safety: Record<string, unknown>;
  };
  verification?: PublicVerificationPolicy;
  content_safety?: PublicContentSafetyPolicy;
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
    content_safety: { ...DEFAULT_CONTENT_SAFETY_POLICY },
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

/** Compares dotted semver-ish versions; returns <0, 0, >0. Missing parts treated as 0. */
function compareVersions(a: string, b: string): number {
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
 * Whether this build ships the Stripe PaymentSheet native SDK. Kept as a compile-time
 * constant so tree-shaking removes the branch until the SDK is bundled. Flip to `true`
 * in the build that adds `@stripe/stripe-react-native`.
 */
export const BUILD_SUPPORTS_STRIPE_NATIVE = false;

export type CheckoutGatewayDecision = {
  /** Resolved region gateway ("paystack" | "stripe" | "unknown"). */
  gateway: string;
  /** True when the app can present the gateway natively in-app. */
  canCheckoutNatively: boolean;
  /**
   * When native checkout is unavailable for the region gateway, use the hosted
   * web checkout fallback instead of the in-app SDK/webview.
   */
  useHostedWebFallback: boolean;
};

/**
 * Decide how the customer app should present checkout for the active market.
 *
 * - Paystack regions: in-app webview flow (existing behaviour) — always native-capable.
 * - Stripe regions: require Stripe PaymentSheet, gated on both build capability and the
 *   region's `gateway_native_min_version`. Older builds fall back to hosted web checkout
 *   so payments never hard-break during a phased native rollout.
 */
export function resolveCheckoutGateway(appVersion?: string | null): CheckoutGatewayDecision {
  const region = getCachedConfigBundle()?.meta?.tenant_region;
  const gateway = (region?.payment_gateway ?? "paystack").trim().toLowerCase() || "paystack";

  if (gateway === "paystack") {
    return { gateway, canCheckoutNatively: true, useHostedWebFallback: false };
  }

  if (gateway === "stripe") {
    const minVersion = region?.gateway_native_min_version ?? null;
    const versionOk =
      !minVersion || !appVersion || compareVersions(appVersion, minVersion) >= 0;
    const nativeOk = BUILD_SUPPORTS_STRIPE_NATIVE && versionOk;
    return {
      gateway,
      canCheckoutNatively: nativeOk,
      useHostedWebFallback: !nativeOk,
    };
  }

  // Unknown gateway → safest path is hosted web checkout.
  return { gateway: gateway || "unknown", canCheckoutNatively: false, useHostedWebFallback: true };
}
