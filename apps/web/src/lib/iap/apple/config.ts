/**
 * Apple App Store Server API credentials.
 * Env vars override platform_secrets for local dev.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type AppleIapConfig = {
  issuerId: string;
  keyId: string;
  privateKeyPem: string;
  bundleId: string;
  commissionRate: number;
  enabled: boolean;
};

/** App Store Connect API (finance reports). Separate from the In-App Purchase key. */
export type AppleConnectConfig = {
  issuerId: string;
  keyId: string;
  privateKeyPem: string;
  vendorNumber: string;
  regionCode: string;
};

function env(name: string): string {
  return (process.env[name] ?? "").trim();
}

/**
 * Apple IAP is on unless it is explicitly switched off.
 *
 * The kill switch exists so a broken store integration can be stopped without a
 * release; it must never be the reason a correctly configured build silently
 * loses its only permitted iOS purchase path (Guideline 3.1.1 forbids sending
 * those customers to Paystack).
 */
export function appleIapEnabledFromEnv(): boolean {
  const raw = env("APPLE_IAP_ENABLED").toLowerCase();
  return raw !== "false" && raw !== "0" && raw !== "off";
}

export async function loadAppleIapConfig(
  supabase?: SupabaseClient,
): Promise<AppleIapConfig | null> {
  let issuerId = env("APPLE_APP_STORE_ISSUER_ID");
  let keyId = env("APPLE_APP_STORE_KEY_ID");
  let privateKeyPem = env("APPLE_APP_STORE_PRIVATE_KEY")?.replace(/\\n/g, "\n");
  let bundleId = env("APPLE_APP_STORE_BUNDLE_ID") || "com.beautonomi.partner";
  let commissionRate = Number(env("APPLE_IAP_COMMISSION_RATE") || "0.15");

  if (supabase) {
    const { data } = await supabase
      .from("platform_secrets")
      .select(
        "apple_app_store_issuer_id, apple_app_store_key_id, apple_app_store_private_key, apple_app_store_bundle_id, apple_iap_commission_rate, apple_asc_vendor_number, apple_finance_region_code, apple_connect_issuer_id, apple_connect_key_id, apple_connect_private_key",
      )
      .is("tenant_id", null)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const row = data as Record<string, unknown> | null;
    if (row) {
      issuerId = issuerId || String(row.apple_app_store_issuer_id ?? "").trim();
      keyId = keyId || String(row.apple_app_store_key_id ?? "").trim();
      privateKeyPem =
        privateKeyPem ||
        String(row.apple_app_store_private_key ?? "")
          .trim()
          .replace(/\\n/g, "\n");
      bundleId =
        String(row.apple_app_store_bundle_id ?? bundleId).trim() || bundleId;
      const dbRate = Number(row.apple_iap_commission_rate);
      if (Number.isFinite(dbRate) && dbRate > 0 && dbRate < 1) {
        commissionRate = dbRate;
      }
    }
  }

  if (!issuerId || !keyId || !privateKeyPem) {
    return null;
  }

  return {
    issuerId,
    keyId,
    privateKeyPem,
    bundleId,
    commissionRate,
    enabled: appleIapEnabledFromEnv(),
  };
}

export async function loadAppleConnectConfig(
  supabase?: SupabaseClient,
): Promise<AppleConnectConfig | null> {
  let issuerId = env("APPLE_CONNECT_ISSUER_ID") || env("APPLE_APP_STORE_ISSUER_ID");
  let keyId = env("APPLE_CONNECT_KEY_ID") || env("APPLE_APP_STORE_KEY_ID");
  let privateKeyPem = (
    env("APPLE_CONNECT_PRIVATE_KEY") || env("APPLE_APP_STORE_PRIVATE_KEY")
  ).replace(/\\n/g, "\n");
  let vendorNumber = env("APPLE_ASC_VENDOR_NUMBER");
  let regionCode = env("APPLE_FINANCE_REGION_CODE") || "ZZ";

  if (supabase) {
    const { data } = await supabase
      .from("platform_secrets")
      .select(
        "apple_app_store_issuer_id, apple_app_store_key_id, apple_app_store_private_key, apple_asc_vendor_number, apple_finance_region_code, apple_connect_issuer_id, apple_connect_key_id, apple_connect_private_key",
      )
      .is("tenant_id", null)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const row = data as Record<string, unknown> | null;
    if (row) {
      issuerId =
        issuerId ||
        String(row.apple_connect_issuer_id ?? "").trim() ||
        String(row.apple_app_store_issuer_id ?? "").trim();
      keyId =
        keyId ||
        String(row.apple_connect_key_id ?? "").trim() ||
        String(row.apple_app_store_key_id ?? "").trim();
      privateKeyPem =
        privateKeyPem ||
        String(row.apple_connect_private_key ?? row.apple_app_store_private_key ?? "")
          .trim()
          .replace(/\\n/g, "\n");
      vendorNumber = vendorNumber || String(row.apple_asc_vendor_number ?? "").trim();
      if (!env("APPLE_FINANCE_REGION_CODE")) {
        const fromDb = String(row.apple_finance_region_code ?? "").trim();
        if (fromDb) regionCode = fromDb;
      }
    }
  }

  if (!issuerId || !keyId || !privateKeyPem || !vendorNumber) {
    return null;
  }

  return {
    issuerId,
    keyId,
    privateKeyPem,
    vendorNumber,
    regionCode: regionCode || "ZZ",
  };
}

export function computeAppleCommission(
  grossMajor: number,
  commissionRate: number,
): { commissionMajor: number; proceedsMajor: number } {
  const rate = Math.min(Math.max(commissionRate, 0), 0.99);
  const commissionMajor = Math.round(grossMajor * rate * 100) / 100;
  const proceedsMajor = Math.round((grossMajor - commissionMajor) * 100) / 100;
  return { commissionMajor, proceedsMajor };
}
