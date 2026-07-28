import type { SupabaseClient } from "@supabase/supabase-js";
import type { PaycloudEnvironment } from "@/lib/payments/paycloud";
import type { PaycloudAppCredentials } from "@/lib/payments/paycloud-client";

type AppRow = {
  app_id: string;
  app_rsa_private_key: string;
  gateway_rsa_public_key: string;
  api_base_url?: string | null;
  is_enabled?: boolean;
  environment?: string;
};

export type PaycloudAppCredentialsFailureReason =
  | "TEST_MODE_DISABLED"
  | "PLATFORM_CREDENTIALS_MISSING";

export type PaycloudAppCredentialsResult =
  | { ok: true; credentials: PaycloudAppCredentials; appEnvironment: PaycloudEnvironment }
  | { ok: false; reason: PaycloudAppCredentialsFailureReason };

async function findAppRow(
  supabase: SupabaseClient,
  filters: {
    id?: string;
    tenantId?: string | null;
    environment: PaycloudEnvironment;
    global?: boolean;
  },
): Promise<AppRow | null> {
  let query = supabase
    .from("tenant_paycloud_apps")
    .select("app_id, app_rsa_private_key, gateway_rsa_public_key, api_base_url, is_enabled, environment");

  if (filters.id) {
    query = query.eq("id", filters.id);
  } else if (filters.global) {
    query = query.is("tenant_id", null).eq("environment", filters.environment);
  } else if (filters.tenantId) {
    query = query.eq("tenant_id", filters.tenantId).eq("environment", filters.environment);
  } else {
    return null;
  }

  const { data } = await query.maybeSingle();
  return (data as AppRow | null) ?? null;
}

function rowToCredentials(
  row: AppRow,
  requirePrivate: boolean,
): PaycloudAppCredentials | null {
  if (!row.gateway_rsa_public_key) return null;
  if (requirePrivate && (!row.app_rsa_private_key || !row.gateway_rsa_public_key)) {
    return null;
  }
  return {
    app_id: row.app_id ?? "",
    app_rsa_private_key: row.app_rsa_private_key ?? "",
    gateway_rsa_public_key: row.gateway_rsa_public_key ?? "",
    api_base_url: row.api_base_url ?? undefined,
  };
}

/**
 * Resolve PayCloud app credentials with a discriminated failure reason.
 */
export async function resolvePaycloudAppCredentialsDetailed(
  supabase: SupabaseClient,
  params: {
    environment: PaycloudEnvironment;
    tenantId: string | null;
    paycloudAppId?: string | null;
    requirePrivateKey?: boolean;
  },
): Promise<PaycloudAppCredentialsResult> {
  const requirePrivate = params.requirePrivateKey !== false;
  let sawDisabledRow = false;

  if (params.paycloudAppId) {
    const linked = await findAppRow(supabase, {
      id: params.paycloudAppId,
      environment: params.environment,
    });
    if (linked) {
      if (linked.is_enabled === false) sawDisabledRow = true;
      else if (
        linked.environment === params.environment &&
        rowToCredentials(linked, requirePrivate)
      ) {
        return {
          ok: true,
          credentials: rowToCredentials(linked, requirePrivate)!,
          appEnvironment: params.environment,
        };
      }
    }
  }

  if (params.tenantId) {
    const tenantApp = await findAppRow(supabase, {
      tenantId: params.tenantId,
      environment: params.environment,
    });
    if (tenantApp) {
      if (tenantApp.is_enabled === false) sawDisabledRow = true;
      else {
        const creds = rowToCredentials(tenantApp, requirePrivate);
        if (creds) {
          return { ok: true, credentials: creds, appEnvironment: params.environment };
        }
      }
    }
  }

  const globalApp = await findAppRow(supabase, {
    environment: params.environment,
    global: true,
  });
  if (globalApp) {
    if (globalApp.is_enabled === false) sawDisabledRow = true;
    else {
      const creds = rowToCredentials(globalApp, requirePrivate);
      if (creds) {
        return { ok: true, credentials: creds, appEnvironment: params.environment };
      }
    }
  }

  if (sawDisabledRow && params.environment === "sandbox") {
    return { ok: false, reason: "TEST_MODE_DISABLED" };
  }

  return { ok: false, reason: "PLATFORM_CREDENTIALS_MISSING" };
}

/**
 * Resolve PayCloud app credentials: merchant-linked app → tenant row → global row.
 */
export async function resolvePaycloudAppCredentials(
  supabase: SupabaseClient,
  params: {
    environment: PaycloudEnvironment;
    tenantId: string | null;
    paycloudAppId?: string | null;
    requirePrivateKey?: boolean;
  },
): Promise<PaycloudAppCredentials | null> {
  const result = await resolvePaycloudAppCredentialsDetailed(supabase, params);
  return result.ok ? result.credentials : null;
}

/** Gateway public key only (webhook signature verify). */
export async function resolvePaycloudGatewayPublicKey(
  supabase: SupabaseClient,
  params: {
    environment: PaycloudEnvironment;
    tenantId: string | null;
    paycloudAppId?: string | null;
  },
): Promise<string | null> {
  const creds = await resolvePaycloudAppCredentials(supabase, {
    ...params,
    requirePrivateKey: false,
  });
  return creds?.gateway_rsa_public_key ?? null;
}
