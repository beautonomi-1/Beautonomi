/**
 * Ecommerce courier runtime: superadmin toggle + live keys.
 *
 * Enablement:
 *   ECOMMERCE_SHIPPING_ENABLED=false|0|off → always off (kill switch)
 *   ECOMMERCE_SHIPPING_ENABLED=true → on
 *   otherwise → platform_secrets.ecommerce_shipping_enabled (default false)
 *
 * Credentials: env overrides platform_secrets (same pattern as Apple / Paystack).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ShippingRuntimeCredentials } from "@beautonomi/shipping";

export type EcommerceShippingEnvOverride = "on" | "off" | "unset";

const SECRET_COLUMNS =
  "ecommerce_shipping_enabled, courier_guy_api_key, courier_guy_base_url, bob_go_api_key, bob_go_base_url, aramex_account_number, aramex_account_pin, aramex_username, aramex_password, aramex_account_entity, aramex_account_country_code, aramex_source, aramex_base_url, updated_at";

function env(name: string): string {
  return (process.env[name] ?? "").trim();
}

export function ecommerceShippingEnvOverride(): EcommerceShippingEnvOverride {
  const raw = env("ECOMMERCE_SHIPPING_ENABLED").toLowerCase();
  if (raw === "false" || raw === "0" || raw === "off") return "off";
  if (raw === "true" || raw === "1" || raw === "on") return "on";
  return "unset";
}

export function resolveEcommerceShippingEnabled(dbEnabled: boolean): boolean {
  const override = ecommerceShippingEnvOverride();
  if (override === "off") return false;
  if (override === "on") return true;
  return dbEnabled;
}

function pick(envValue: string, dbValue: unknown): string {
  if (envValue) return envValue;
  return typeof dbValue === "string" ? dbValue.trim() : "";
}

export type EcommerceShippingRuntime = {
  enabled: boolean;
  dbEnabled: boolean;
  envOverride: EcommerceShippingEnvOverride;
  credentials: ShippingRuntimeCredentials;
  configured: {
    "courier-guy": boolean;
    "bob-go": boolean;
    aramex: boolean;
  };
  updatedAt: string | null;
  raw: Record<string, unknown> | null;
};

export async function loadEcommerceShippingRuntime(
  supabase: SupabaseClient,
): Promise<EcommerceShippingRuntime> {
  const { data } = await supabase
    .from("platform_secrets")
    .select(SECRET_COLUMNS)
    .is("tenant_id", null)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const row = (data as Record<string, unknown> | null) ?? null;
  const dbEnabled = row?.ecommerce_shipping_enabled === true;
  const courierGuyKey = pick(env("COURIER_GUY_API_KEY"), row?.courier_guy_api_key);
  const courierGuyBase = pick(env("COURIER_GUY_BASE_URL"), row?.courier_guy_base_url);
  const bobGoKey = pick(env("BOB_GO_API_KEY"), row?.bob_go_api_key);
  const bobGoBase = pick(env("BOB_GO_BASE_URL"), row?.bob_go_base_url);
  const aramexNumber = pick(env("ARAMEX_ACCOUNT_NUMBER"), row?.aramex_account_number);
  const aramexPin = pick(env("ARAMEX_ACCOUNT_PIN"), row?.aramex_account_pin);
  const aramexUser = pick(env("ARAMEX_USERNAME"), row?.aramex_username);
  const aramexPass = pick(env("ARAMEX_PASSWORD"), row?.aramex_password);
  const aramexEntity = pick(env("ARAMEX_ACCOUNT_ENTITY"), row?.aramex_account_entity);
  const aramexCountry = pick(env("ARAMEX_ACCOUNT_COUNTRY_CODE"), row?.aramex_account_country_code);
  const aramexSource = pick(env("ARAMEX_SOURCE"), row?.aramex_source);
  const aramexBase = pick(env("ARAMEX_BASE_URL"), row?.aramex_base_url);

  const credentials: ShippingRuntimeCredentials = {};
  if (courierGuyKey) {
    credentials["courier-guy"] = { apiKey: courierGuyKey, baseUrl: courierGuyBase || undefined };
  }
  if (bobGoKey) {
    credentials["bob-go"] = { apiKey: bobGoKey, baseUrl: bobGoBase || undefined };
  }
  if (aramexNumber && aramexPin && aramexUser && aramexPass) {
    const sourceNum = Number(aramexSource);
    credentials.aramex = {
      accountNumber: aramexNumber,
      accountPin: aramexPin,
      username: aramexUser,
      password: aramexPass,
      accountEntity: aramexEntity || undefined,
      accountCountryCode: aramexCountry || undefined,
      source: Number.isFinite(sourceNum) && sourceNum > 0 ? sourceNum : undefined,
      baseUrl: aramexBase || undefined,
    };
  }

  return {
    enabled: resolveEcommerceShippingEnabled(dbEnabled),
    dbEnabled,
    envOverride: ecommerceShippingEnvOverride(),
    credentials,
    configured: {
      "courier-guy": Boolean(credentials["courier-guy"]),
      "bob-go": Boolean(credentials["bob-go"]),
      aramex: Boolean(credentials.aramex),
    },
    updatedAt: typeof row?.updated_at === "string" ? row.updated_at : null,
    raw: row,
  };
}

export function maskSecret(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.length <= 8) return "***";
  return value.slice(0, 4) + "..." + value.slice(-4);
}
