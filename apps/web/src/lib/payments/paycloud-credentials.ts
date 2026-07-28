import type { SupabaseClient } from "@supabase/supabase-js";
import type { PaycloudEnvironment } from "@/lib/payments/paycloud";
import type { PaycloudAppCredentials } from "@/lib/payments/paycloud-client";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  resolvePaycloudAppCredentialsDetailed,
  type PaycloudAppCredentialsFailureReason,
} from "@/lib/payments/resolve-paycloud-app-credentials";

export interface ResolvedPaycloudContext {
  environment: PaycloudEnvironment;
  merchant_no: string;
  store_no: string;
  credentials: PaycloudAppCredentials;
  /** Resolved app environment (for ENV_MISMATCH checks). */
  appEnvironment: PaycloudEnvironment;
  /** tenant_paycloud_apps.id for metadata (intent_contract overrides). */
  paycloud_app_db_id?: string | null;
  tenant_id?: string | null;
}

export type PaycloudContextFailureReason =
  | "TERMINAL_MISSING"
  | "TERMINAL_INACTIVE"
  | "TERMINAL_SUSPENDED"
  | "MERCHANT_MISSING"
  | "MERCHANT_INACTIVE"
  | "ENV_MISMATCH"
  | PaycloudAppCredentialsFailureReason;

export type ResolvePaycloudContextResult =
  | { ok: true; ctx: ResolvedPaycloudContext }
  | { ok: false; reason: PaycloudContextFailureReason };

/** Map a context resolution failure to an API error code + message. */
export function paycloudContextFailureToApiError(reason: PaycloudContextFailureReason): {
  code: string;
  message: string;
} {
  switch (reason) {
    case "TERMINAL_MISSING":
      return { code: "TERMINAL_NOT_FOUND", message: "Card machine not found." };
    case "TERMINAL_INACTIVE":
      return {
        code: "TERMINAL_UNAVAILABLE",
        message: "This card machine is turned off. Turn it on in Card machines settings.",
      };
    case "TERMINAL_SUSPENDED":
      return {
        code: "TERMINAL_UNAVAILABLE",
        message: "This card machine has been suspended. Contact Beautonomi for help.",
      };
    case "MERCHANT_MISSING":
      return {
        code: "TERMINAL_NOT_CONFIGURED",
        message: "This card machine is missing merchant setup. Contact Beautonomi.",
      };
    case "MERCHANT_INACTIVE":
      return {
        code: "MERCHANT_INACTIVE",
        message: "Card machine account isn't ready yet. Contact support if this continues.",
      };
    case "TEST_MODE_DISABLED":
      return {
        code: "TEST_MODE_DISABLED",
        message: "Test mode is switched off for your account.",
      };
    case "PLATFORM_CREDENTIALS_MISSING":
      return {
        code: "PLATFORM_CREDENTIALS_MISSING",
        message:
          "Beautonomi is still activating this machine's payment account. Nothing for you to do on your side.",
      };
    case "ENV_MISMATCH":
      return {
        code: "ENV_MISMATCH",
        message: "This card machine is set up for a different mode (test vs live).",
      };
    default:
      return {
        code: "TERMINAL_NOT_CONFIGURED",
        message: "This card machine isn't fully set up yet.",
      };
  }
}

/**
 * Resolve PayCloud credentials for a provider's assigned terminal.
 * Terminal ownership is checked on the caller's RLS-scoped client; merchant + app
 * credentials are resolved with the service client (tenant_paycloud_apps is service-role only).
 */
export async function resolvePaycloudContextForProvider(
  supabase: SupabaseClient,
  providerId: string,
  terminalId: string,
): Promise<ResolvePaycloudContextResult> {
  const { data: terminal } = await supabase
    .from("paycloud_terminals")
    .select(
      "id, paycloud_merchant_id, provider_id, status, is_active, tenant_id",
    )
    .eq("id", terminalId)
    .eq("provider_id", providerId)
    .maybeSingle();

  if (!terminal) return { ok: false, reason: "TERMINAL_MISSING" };
  if (!terminal.is_active) return { ok: false, reason: "TERMINAL_INACTIVE" };
  if (terminal.status === "suspended" || terminal.status === "decommissioned") {
    return { ok: false, reason: "TERMINAL_SUSPENDED" };
  }

  const admin = getSupabaseAdmin();
  const { data: merchant } = await admin
    .from("paycloud_merchants")
    .select("merchant_no, store_no, environment, paycloud_app_id, tenant_id, is_active")
    .eq("id", terminal.paycloud_merchant_id)
    .maybeSingle();

  if (!merchant) return { ok: false, reason: "MERCHANT_MISSING" };
  if (!merchant.is_active) return { ok: false, reason: "MERCHANT_INACTIVE" };

  const env = (merchant.environment as PaycloudEnvironment) ?? "live";
  const tenantId = (merchant as { tenant_id?: string | null }).tenant_id ?? null;

  const credResult = await resolvePaycloudAppCredentialsDetailed(admin, {
    environment: env,
    tenantId,
    paycloudAppId: merchant.paycloud_app_id,
  });
  if (!credResult.ok) {
    return { ok: false, reason: credResult.reason };
  }

  if (credResult.appEnvironment !== env) {
    return { ok: false, reason: "ENV_MISMATCH" };
  }

  return {
    ok: true,
    ctx: {
      environment: env,
      merchant_no: merchant.merchant_no,
      store_no: merchant.store_no,
      credentials: credResult.credentials,
      appEnvironment: credResult.appEnvironment,
      paycloud_app_db_id: (merchant as { paycloud_app_id?: string | null }).paycloud_app_id ?? null,
      tenant_id: tenantId,
    },
  };
}

export function getPaycloudNotifyUrl(request?: Request): string {
  const host = process.env.NEXT_PUBLIC_APP_URL ?? process.env.VERCEL_URL;
  if (host) {
    const base = host.startsWith("http") ? host : `https://${host}`;
    return `${base}/api/provider/paycloud/webhook`;
  }
  if (request) {
    const url = new URL(request.url);
    return `${url.origin}/api/provider/paycloud/webhook`;
  }
  return "/api/provider/paycloud/webhook";
}

export function validatePaycloudNotifyUrl(
  url: string,
): { ok: true; url: string } | { ok: false; code: "NOTIFY_URL_INVALID"; message: string } {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") {
      return {
        ok: false,
        code: "NOTIFY_URL_INVALID",
        message:
          "PayCloud notify URL must be absolute HTTPS. Set NEXT_PUBLIC_APP_URL to your public site URL.",
      };
    }
    return { ok: true, url: parsed.toString() };
  } catch {
    return {
      ok: false,
      code: "NOTIFY_URL_INVALID",
      message:
        "PayCloud notify URL must be absolute HTTPS. Set NEXT_PUBLIC_APP_URL to your public site URL.",
    };
  }
}
