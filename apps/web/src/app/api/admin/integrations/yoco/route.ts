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
import { DEFAULT_YOCO_SCOPES } from "@/lib/payments/yoco-oauth";
import { z } from "zod";

function maskClientId(v: string | null | undefined): string | null {
  if (!v || typeof v !== "string") return null;
  const t = v.trim();
  if (t.length <= 10) return "***";
  return `${t.slice(0, 6)}…${t.slice(-4)}`;
}

type YocoEnv = "live" | "sandbox";

const yocoPatchSchema = z.object({
  environment: z.enum(["live", "sandbox"]),
  client_id: z.string().optional(),
  client_secret: z.string().optional(),
  /** Empty string ⇒ "keep existing value". Non-empty must be a valid URL. */
  redirect_uri: z
    .string()
    .optional()
    .refine((v) => !v || z.string().url().safeParse(v).success, {
      message: "redirect_uri must be a valid URL",
    }),
  default_scopes: z.string().optional(),
  is_enabled: z.boolean().optional(),
});

async function fetchOauthAppRow(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  env: YocoEnv,
  scopeTenantId: string | null,
): Promise<{
  source: "tenant" | "global";
  masked_client_id: string | null;
  redirect_uri: string | null;
  default_scopes: string | null;
  has_client_secret: boolean;
  is_enabled: boolean;
  updated_at: string | null;
} | null> {
  if (scopeTenantId) {
    const { data: tenantRow, error: te } = await (supabase
      .from("tenant_yoco_oauth_apps") as any)
      .select("client_id, client_secret, redirect_uri, default_scopes, is_enabled, updated_at")
      .eq("tenant_id", scopeTenantId)
      .eq("environment", env)
      .maybeSingle();
    if (!te && tenantRow && typeof tenantRow === "object") {
      const r = tenantRow as {
        client_id?: string;
        client_secret?: string;
        redirect_uri?: string;
        default_scopes?: string;
        is_enabled?: boolean;
        updated_at?: string | null;
      };
      return {
        source: "tenant",
        masked_client_id: maskClientId(r.client_id),
        redirect_uri: r.redirect_uri?.trim() || null,
        default_scopes: r.default_scopes?.trim() || null,
        has_client_secret: !!r.client_secret?.trim(),
        is_enabled: r.is_enabled !== false,
        updated_at: r.updated_at ?? null,
      };
    }
  }

  const { data: globalRow, error: ge } = await (supabase
    .from("tenant_yoco_oauth_apps") as any)
    .select("client_id, client_secret, redirect_uri, default_scopes, is_enabled, updated_at")
    .is("tenant_id", null)
    .eq("environment", env)
    .maybeSingle();
  if (ge || !globalRow || typeof globalRow !== "object") return null;
  const g = globalRow as {
    client_id?: string;
    client_secret?: string;
    redirect_uri?: string;
    default_scopes?: string;
    is_enabled?: boolean;
    updated_at?: string | null;
  };
  return {
    source: "global",
    masked_client_id: maskClientId(g.client_id),
    redirect_uri: g.redirect_uri?.trim() || null,
    default_scopes: g.default_scopes?.trim() || null,
    has_client_secret: !!g.client_secret?.trim(),
    is_enabled: g.is_enabled !== false,
    updated_at: g.updated_at ?? null,
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

/**
 * PATCH /api/admin/integrations/yoco
 *
 * Upserts a platform/global or tenant-scoped Yoco OAuth app row. Secrets are
 * write-only: full client_secret is accepted but never returned by GET.
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

    const parsed = yocoPatchSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(
        parsed.error.issues.map((issue) => issue.message).join(", "),
        "VALIDATION_ERROR",
        400,
      );
    }

    const supabase = getSupabaseAdmin();
    let existingQuery = (supabase.from("tenant_yoco_oauth_apps") as any)
      .select("id, client_id, client_secret, redirect_uri, default_scopes, is_enabled")
      .eq("environment", parsed.data.environment);
    existingQuery =
      scopeTenantId == null ? existingQuery.is("tenant_id", null) : existingQuery.eq("tenant_id", scopeTenantId);
    const { data: existing, error: existingError } = await existingQuery.maybeSingle();
    if (existingError) throw existingError;

    const existingRow =
      (existing as {
        id?: string;
        client_id?: string | null;
        client_secret?: string | null;
        redirect_uri?: string | null;
        default_scopes?: string | null;
        is_enabled?: boolean | null;
      } | null) ?? null;

    const clientId = parsed.data.client_id?.trim() || existingRow?.client_id?.trim() || "";
    const clientSecret = parsed.data.client_secret?.trim() || existingRow?.client_secret?.trim() || "";
    const redirectUri = parsed.data.redirect_uri?.trim() || existingRow?.redirect_uri?.trim() || "";
    const defaultScopes =
      parsed.data.default_scopes?.trim() || existingRow?.default_scopes?.trim() || DEFAULT_YOCO_SCOPES;

    if (!clientId || !clientSecret || !redirectUri) {
      return errorResponse(
        "Client ID, client secret, and redirect URI are required when creating or completing a Yoco OAuth app row.",
        "VALIDATION_ERROR",
        400,
      );
    }

    const payload = {
      tenant_id: scopeTenantId,
      environment: parsed.data.environment,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      default_scopes: defaultScopes,
      is_enabled: parsed.data.is_enabled ?? existingRow?.is_enabled ?? true,
      updated_at: new Date().toISOString(),
    };

    let opError: unknown;
    if (existingRow?.id) {
      const { error } = await (supabase.from("tenant_yoco_oauth_apps") as any)
        .update(payload)
        .eq("id", existingRow.id);
      opError = error;
    } else {
      const { error } = await (supabase.from("tenant_yoco_oauth_apps") as any)
        .insert(payload);
      opError = error;
    }
    if (opError) throw opError;

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: (user as { role?: string }).role ?? "superadmin",
      action: "admin.integrations.yoco.oauth_app.updated",
      entity_type: "tenant_yoco_oauth_apps",
      entity_id: existingRow?.id ?? null,
      metadata: {
        scope: requestedScope.scope,
        tenant_id: scopeTenantId,
        environment: parsed.data.environment,
        fields_updated: Object.keys(parsed.data).filter((key) => key !== "scope" && key !== "tenant_id"),
      },
    });

    return successResponse({ message: "Yoco OAuth app configuration updated" });
  } catch (error) {
    return handleApiError(error, "Failed to update Yoco integration configuration");
  }
}
