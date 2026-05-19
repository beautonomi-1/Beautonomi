import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { resolveAdminTenantContext } from "@/lib/tenant/scoped-overrides";
import { FEATURE_FLAG_KEYS } from "@/lib/server/feature-flag-keys";

function maskClientId(v: string | null | undefined): string | null {
  if (!v || typeof v !== "string") return null;
  const t = v.trim();
  if (t.length <= 10) return "***";
  return `${t.slice(0, 6)}…${t.slice(-4)}`;
}

type YocoEnv = "live" | "sandbox";

async function fetchOauthAppRow(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  env: YocoEnv,
  scopeTenantId: string | null,
): Promise<{
  source: "tenant" | "global";
  masked_client_id: string | null;
  redirect_uri: string | null;
  is_enabled: boolean;
} | null> {
  if (scopeTenantId) {
    const { data: tenantRow, error: te } = await (supabase
      .from("tenant_yoco_oauth_apps") as any)
      .select("client_id, redirect_uri, is_enabled")
      .eq("tenant_id", scopeTenantId)
      .eq("environment", env)
      .maybeSingle();
    if (!te && tenantRow && typeof tenantRow === "object") {
      const r = tenantRow as {
        client_id?: string;
        redirect_uri?: string;
        is_enabled?: boolean;
      };
      return {
        source: "tenant",
        masked_client_id: maskClientId(r.client_id),
        redirect_uri: r.redirect_uri?.trim() || null,
        is_enabled: r.is_enabled !== false,
      };
    }
  }

  const { data: globalRow, error: ge } = await (supabase
    .from("tenant_yoco_oauth_apps") as any)
    .select("client_id, redirect_uri, is_enabled")
    .is("tenant_id", null)
    .eq("environment", env)
    .maybeSingle();
  if (ge || !globalRow || typeof globalRow !== "object") return null;
  const g = globalRow as {
    client_id?: string;
    redirect_uri?: string;
    is_enabled?: boolean;
  };
  return {
    source: "global",
    masked_client_id: maskClientId(g.client_id),
    redirect_uri: g.redirect_uri?.trim() || null,
    is_enabled: g.is_enabled !== false,
  };
}

function envOauthPartial(suffix: "" | "_SANDBOX") {
  const id = suffix
    ? process.env.YOCO_OAUTH_CLIENT_ID_SANDBOX
    : process.env.YOCO_OAUTH_CLIENT_ID;
  const sec = suffix
    ? process.env.YOCO_OAUTH_CLIENT_SECRET_SANDBOX
    : process.env.YOCO_OAUTH_CLIENT_SECRET;
  const redir = suffix
    ? process.env.YOCO_OAUTH_REDIRECT_URI_SANDBOX
    : process.env.YOCO_OAUTH_REDIRECT_URI;
  return {
    has_client_id: !!id?.trim(),
    has_client_secret: !!sec?.trim(),
    has_redirect_uri: !!redir?.trim(),
  };
}

/**
 * GET /api/admin/integrations/yoco
 *
 * Non-secret operational snapshot for configuring Yoco Web POS OAuth per
 * tenant vs platform defaults. Superadmin only (same bar as Paystack keys).
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

    let flagQ = (supabase.from("feature_flags") as any)
      .select("enabled, tenant_id")
      .eq("feature_key", FEATURE_FLAG_KEYS.YOCO_OAUTH_V2);
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
    const oauthV2Effective =
      tenantFlag != null ? tenantFlag.enabled === true : globalFlag?.enabled === true;

    const liveApp = await fetchOauthAppRow(supabase, "live", scopeTenantId);
    const sandboxApp = await fetchOauthAppRow(supabase, "sandbox", scopeTenantId);

    const envFallbackLive = envOauthPartial("");
    const envFallbackSandbox = envOauthPartial("_SANDBOX");
    const hasEnvLive =
      envFallbackLive.has_client_id &&
      envFallbackLive.has_client_secret &&
      envFallbackLive.has_redirect_uri;
    const hasEnvSandbox =
      envFallbackSandbox.has_client_id &&
      envFallbackSandbox.has_client_secret &&
      envFallbackSandbox.has_redirect_uri;

    return successResponse({
      admin_scope: requestedScope.scope,
      effective_tenant_id: scopeTenantId,
      oauth_v2_feature: {
        effective_enabled: oauthV2Effective,
        global_row_present: globalFlag != null,
        global_row_enabled: globalFlag?.enabled ?? null,
        tenant_row_present: tenantFlag != null,
        tenant_row_enabled: tenantFlag?.enabled ?? null,
        feature_key: FEATURE_FLAG_KEYS.YOCO_OAUTH_V2,
      },
      platform_env: {
        YOCO_ENV: process.env.YOCO_ENV?.trim() || null,
        live_oauth_env_vars: envFallbackLive,
        sandbox_oauth_env_vars: envFallbackSandbox,
        live_oauth_env_complete: hasEnvLive,
        sandbox_oauth_env_complete: hasEnvSandbox,
      },
      tenant_yoco_oauth_apps: {
        live: liveApp,
        sandbox: sandboxApp,
      },
      resolution_notes: {
        oauth_client_order:
          "Per request: tenant row in tenant_yoco_oauth_apps → global row (tenant_id NULL) → server env vars (YOCO_OAUTH_*).",
        provider_connect:
          "Providers use Payment Settings → Connect Yoco (OAuth) when the yoco_oauth_v2 flag is on for their tenant.",
      },
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch Yoco integration status");
  }
}
