import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { resolveAdminTenantContext } from "@/lib/tenant/scoped-overrides";
import { FEATURE_FLAG_KEYS } from "@/lib/server/feature-flag-keys";
import { writeAuditLog } from "@/lib/audit/audit";
import { getPaycloudApiBase } from "@/lib/payments/paycloud";
import { z } from "zod";
import { getPaycloudNotifyUrl, validatePaycloudNotifyUrl } from "@/lib/payments/paycloud-credentials";
import {
  paycloudSandboxFixtureMatchesLiveSave,
} from "@/lib/payments/paycloud-sandbox-fixtures";
import {
  validatePrivateKeyPem,
  validatePublicKeyPem,
} from "@/lib/payments/paycloud-sign";

type PaycloudEnv = "live" | "sandbox";

function maskCredential(v: string | null | undefined): string | null {
  if (!v || typeof v !== "string") return null;
  const t = v.trim();
  if (t.length <= 10) return "***";
  return `${t.slice(0, 6)}…${t.slice(-4)}`;
}

const paycloudPatchSchema = z.object({
  environment: z.enum(["live", "sandbox"]),
  app_id: z.string().optional(),
  app_rsa_private_key: z.string().optional(),
  gateway_rsa_public_key: z.string().optional(),
  api_base_url: z.string().optional(),
  is_enabled: z.boolean().optional(),
});

async function fetchPaycloudAppRow(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  env: PaycloudEnv,
  scopeTenantId: string | null,
): Promise<{
  source: "tenant" | "global";
  row_id: string | null;
  masked_app_id: string | null;
  api_base_url: string | null;
  has_app_rsa_private_key: boolean;
  has_gateway_rsa_public_key: boolean;
  is_enabled: boolean;
  updated_at: string | null;
} | null> {
  if (scopeTenantId) {
    const { data: tenantRow, error: te } = await (supabase
      .from("tenant_paycloud_apps") as any)
      .select(
        "id, app_id, app_rsa_private_key, gateway_rsa_public_key, api_base_url, is_enabled, updated_at",
      )
      .eq("tenant_id", scopeTenantId)
      .eq("environment", env)
      .maybeSingle();
    if (!te && tenantRow && typeof tenantRow === "object") {
      const r = tenantRow as {
        app_id?: string;
        app_rsa_private_key?: string;
        gateway_rsa_public_key?: string;
        api_base_url?: string;
        is_enabled?: boolean;
        updated_at?: string | null;
      };
      return {
        source: "tenant",
        row_id: (tenantRow as { id?: string }).id ?? null,
        masked_app_id: maskCredential(r.app_id),
        api_base_url: r.api_base_url?.trim() || null,
        has_app_rsa_private_key: !!r.app_rsa_private_key?.trim(),
        has_gateway_rsa_public_key: !!r.gateway_rsa_public_key?.trim(),
        is_enabled: r.is_enabled !== false,
        updated_at: r.updated_at ?? null,
      };
    }
  }

  const { data: globalRow, error: ge } = await (supabase
    .from("tenant_paycloud_apps") as any)
    .select(
      "id, app_id, app_rsa_private_key, gateway_rsa_public_key, api_base_url, is_enabled, updated_at",
    )
    .is("tenant_id", null)
    .eq("environment", env)
    .maybeSingle();
  if (ge || !globalRow || typeof globalRow !== "object") return null;
  const g = globalRow as {
    app_id?: string;
    app_rsa_private_key?: string;
    gateway_rsa_public_key?: string;
    api_base_url?: string;
    is_enabled?: boolean;
    updated_at?: string | null;
  };
  return {
    source: "global",
    row_id: (globalRow as { id?: string }).id ?? null,
    masked_app_id: maskCredential(g.app_id),
    api_base_url: g.api_base_url?.trim() || null,
    has_app_rsa_private_key: !!g.app_rsa_private_key?.trim(),
    has_gateway_rsa_public_key: !!g.gateway_rsa_public_key?.trim(),
    is_enabled: g.is_enabled !== false,
    updated_at: g.updated_at ?? null,
  };
}

async function resolveFeatureFlag(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  featureKey: string,
  scopeTenantId: string | null,
) {
  let flagQ = (supabase.from("feature_flags") as any)
    .select("enabled, tenant_id")
    .eq("feature_key", featureKey);
  flagQ = scopeTenantId
    ? flagQ.or(`tenant_id.is.null,tenant_id.eq.${scopeTenantId}`)
    : flagQ.is("tenant_id", null);
  const { data: flagRows, error: flagErr } = await flagQ;
  if (flagErr) throw flagErr;

  const rows = (flagRows ?? []) as Array<{ enabled?: boolean; tenant_id?: string | null }>;
  const tenantFlag = scopeTenantId
    ? rows.find((r) => r.tenant_id === scopeTenantId)
    : undefined;
  const globalFlag = rows.find((r) => r.tenant_id == null);
  const effectiveEnabled =
    tenantFlag != null ? tenantFlag.enabled === true : globalFlag?.enabled === true;

  return {
    effective_enabled: effectiveEnabled,
    global_row_present: globalFlag != null,
    global_row_enabled: globalFlag?.enabled ?? null,
    tenant_row_present: tenantFlag != null,
    tenant_row_enabled: tenantFlag?.enabled ?? null,
    feature_key: featureKey,
  };
}

/**
 * GET /api/admin/integrations/paycloud
 *
 * Non-secret operational snapshot for PayCloud platform credentials and rollout.
 * Superadmin only.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["superadmin"], request);
    const { currentTenantId, requestedScope } = await resolveAdminTenantContext(
      request,
      undefined,
      (user as { role?: string }).role ?? null,
    );
    const scopeTenantId =
      requestedScope.scope === "global" ? null : requestedScope.tenantId ?? currentTenantId;

    const supabase = getSupabaseAdmin();

    const [paycloudFeature, qrFeature, cashbackFeature, sameTerminalFeature] = await Promise.all([
      resolveFeatureFlag(supabase, FEATURE_FLAG_KEYS.PAYMENT_PAYCLOUD, scopeTenantId),
      resolveFeatureFlag(supabase, FEATURE_FLAG_KEYS.PAYMENT_PAYCLOUD_QR, scopeTenantId),
      resolveFeatureFlag(supabase, FEATURE_FLAG_KEYS.PAYMENT_PAYCLOUD_CASHBACK, scopeTenantId),
      resolveFeatureFlag(supabase, FEATURE_FLAG_KEYS.PAYMENT_PAYCLOUD_SAME_TERMINAL, scopeTenantId),
    ]);

    const liveApp = await fetchPaycloudAppRow(supabase, "live", scopeTenantId);
    const sandboxApp = await fetchPaycloudAppRow(supabase, "sandbox", scopeTenantId);

    let merchantsQuery = supabase
      .from("paycloud_merchants")
      .select("id", { count: "exact", head: true });
    let terminalsQuery = supabase
      .from("paycloud_terminals")
      .select("id", { count: "exact", head: true })
      .not("status", "eq", "decommissioned");

    if (scopeTenantId) {
      merchantsQuery = merchantsQuery.eq("tenant_id", scopeTenantId);
      terminalsQuery = terminalsQuery.eq("tenant_id", scopeTenantId);
    }

    const [{ count: merchantsCount }, { count: terminalsCount }, planRows] = await Promise.all([
      merchantsQuery,
      terminalsQuery,
      supabase
        .from("subscription_plans")
        .select("features")
        .eq("is_active", true),
    ]);

    const notifyUrl = getPaycloudNotifyUrl(request);
    const notifyCheck = validatePaycloudNotifyUrl(notifyUrl);
    const plans = planRows.data ?? [];
    const paycloudPlanEnabled = plans.some((p) => {
      const features = (p as { features?: Record<string, unknown> }).features ?? {};
      const node = features.paycloud_integration;
      if (!node || typeof node !== "object") return false;
      return (node as { enabled?: boolean }).enabled === true;
    });

    return successResponse({
      admin_scope: requestedScope.scope,
      effective_tenant_id: scopeTenantId,
      payment_paycloud_feature: paycloudFeature,
      payment_paycloud_qr_feature: qrFeature,
      payment_paycloud_cashback_feature: cashbackFeature,
      payment_paycloud_same_terminal_feature: sameTerminalFeature,
      platform_env: {
        PAYCLOUD_API_BASE_LIVE: process.env.PAYCLOUD_API_BASE_LIVE?.trim() || null,
        PAYCLOUD_API_BASE_SANDBOX: process.env.PAYCLOUD_API_BASE_SANDBOX?.trim() || null,
        default_api_base: {
          live: getPaycloudApiBase("live"),
          sandbox: getPaycloudApiBase("sandbox"),
        },
      },
      tenant_paycloud_apps: {
        live: liveApp,
        sandbox: sandboxApp,
      },
      counts: {
        merchants: merchantsCount ?? 0,
        terminals: terminalsCount ?? 0,
      },
      readiness: {
        notify_url: notifyUrl,
        notify_url_valid: notifyCheck.ok,
        paycloud_plan_entitlement_enabled: paycloudPlanEnabled,
        live_api_base:
          liveApp?.api_base_url?.trim() ||
          process.env.PAYCLOUD_API_BASE_LIVE?.trim() ||
          getPaycloudApiBase("live"),
      },
      resolution_notes: {
        credentials_order:
          "Per request: tenant row in tenant_paycloud_apps → global row (tenant_id NULL) → server env defaults for API base URL.",
        provider_connect:
          "Providers enable card machines in Payment Settings when payment_paycloud is on; terminals are assigned by admin or self-added.",
      },
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch PayCloud integration status");
  }
}

/**
 * PATCH /api/admin/integrations/paycloud
 *
 * Upserts a platform/global or tenant-scoped PayCloud app row. RSA keys are
 * write-only: full values are accepted but never returned by GET.
 */
export async function PATCH(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["superadmin"], request);
    const body = await request.json();
    const { currentTenantId, requestedScope } = await resolveAdminTenantContext(
      request,
      body as Record<string, unknown>,
      (user as { role?: string }).role ?? null,
    );
    const scopeTenantId =
      requestedScope.scope === "global" ? null : requestedScope.tenantId ?? currentTenantId;

    const parsed = paycloudPatchSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(
        parsed.error.issues.map((issue) => issue.message).join(", "),
        "VALIDATION_ERROR",
        400,
      );
    }

    const supabase = getSupabaseAdmin();
    let existingQuery = (supabase.from("tenant_paycloud_apps") as any)
      .select(
        "id, app_id, app_rsa_private_key, gateway_rsa_public_key, api_base_url, is_enabled",
      )
      .eq("environment", parsed.data.environment);
    existingQuery =
      scopeTenantId == null
        ? existingQuery.is("tenant_id", null)
        : existingQuery.eq("tenant_id", scopeTenantId);
    const { data: existing, error: existingError } = await existingQuery.maybeSingle();
    if (existingError) throw existingError;

    const existingRow =
      (existing as {
        id?: string;
        app_id?: string | null;
        app_rsa_private_key?: string | null;
        gateway_rsa_public_key?: string | null;
        api_base_url?: string | null;
        is_enabled?: boolean | null;
      } | null) ?? null;

    const appId = parsed.data.app_id?.trim() || existingRow?.app_id?.trim() || "";
    const appRsaPrivateKey =
      parsed.data.app_rsa_private_key?.trim() || existingRow?.app_rsa_private_key?.trim() || "";
    const gatewayRsaPublicKey =
      parsed.data.gateway_rsa_public_key?.trim() ||
      existingRow?.gateway_rsa_public_key?.trim() ||
      "";
    const apiBaseUrl =
      parsed.data.api_base_url?.trim() ||
      existingRow?.api_base_url?.trim() ||
      getPaycloudApiBase(parsed.data.environment);

    if (!appId || !appRsaPrivateKey || !gatewayRsaPublicKey || !apiBaseUrl) {
      return errorResponse(
        "App ID, app RSA private key, gateway RSA public key, and API base URL are required when creating or completing a PayCloud app row.",
        "VALIDATION_ERROR",
        400,
      );
    }

    const sandboxLiveConflict = paycloudSandboxFixtureMatchesLiveSave({
      app_id: parsed.data.app_id,
      gateway_rsa_public_key: parsed.data.gateway_rsa_public_key,
      api_base_url: parsed.data.api_base_url,
    });
    if (parsed.data.environment === "live" && sandboxLiveConflict) {
      return errorResponse(sandboxLiveConflict, "SANDBOX_FIXTURE_ON_LIVE", 400);
    }

    const privateKeyCheck = validatePrivateKeyPem(appRsaPrivateKey);
    if (privateKeyCheck.ok === false) {
      return errorResponse(privateKeyCheck.message, "INVALID_PRIVATE_KEY", 400);
    }
    const publicKeyCheck = validatePublicKeyPem(gatewayRsaPublicKey);
    if (publicKeyCheck.ok === false) {
      return errorResponse(publicKeyCheck.message, "INVALID_PUBLIC_KEY", 400);
    }

    const payload = {
      tenant_id: scopeTenantId,
      environment: parsed.data.environment,
      app_id: appId,
      app_rsa_private_key: appRsaPrivateKey,
      gateway_rsa_public_key: gatewayRsaPublicKey,
      api_base_url: apiBaseUrl,
      is_enabled: parsed.data.is_enabled ?? existingRow?.is_enabled ?? true,
      updated_at: new Date().toISOString(),
    };

    let opError: unknown;
    if (existingRow?.id) {
      const { error } = await (supabase.from("tenant_paycloud_apps") as any)
        .update(payload)
        .eq("id", existingRow.id);
      opError = error;
    } else {
      const { error } = await (supabase.from("tenant_paycloud_apps") as any).insert(payload);
      opError = error;
    }
    if (opError) throw opError;

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: (user as { role?: string }).role ?? "superadmin",
      action: "admin.integrations.paycloud.app.updated",
      entity_type: "tenant_paycloud_apps",
      entity_id: existingRow?.id ?? null,
      metadata: {
        scope: requestedScope.scope,
        tenant_id: scopeTenantId,
        environment: parsed.data.environment,
        fields_updated: Object.keys(parsed.data).filter(
          (key) => key !== "scope" && key !== "tenant_id",
        ),
      },
    });

    return successResponse({ message: "PayCloud app configuration updated" });
  } catch (error) {
    return handleApiError(error, "Failed to update PayCloud integration configuration");
  }
}
