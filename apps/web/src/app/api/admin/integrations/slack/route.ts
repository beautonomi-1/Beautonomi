import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_INTEGRATIONS_DEV } from "@/lib/admin-sections";
import { resolveAdminTenantContext, fetchScopedSingle } from "@/lib/tenant/scoped-overrides";
import { writeConfigChangeLog } from "@/lib/config/config-change-log";
import { mergeSlackRouting } from "@/lib/integrations/slack/default-routing";

const ENVS = ["production", "staging", "development"] as const;

function parseEnv(s: string | null): (typeof ENVS)[number] {
  return s && ENVS.includes(s as (typeof ENVS)[number]) ? (s as (typeof ENVS)[number]) : "production";
}

function maskToken(v: string | null | undefined): string | null {
  if (!v) return null;
  if (v.length <= 8) return "***";
  return `${v.slice(0, 6)}…${v.slice(-4)}`;
}

function toSafe(row: Record<string, unknown> | null) {
  if (!row) return null;
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    environment: row.environment,
    enabled: row.enabled,
    team_id: row.team_id,
    team_name: row.team_name,
    bot_user_id: row.bot_user_id,
    bot_token_set: Boolean(row.bot_token_secret),
    masked_bot_token: maskToken(row.bot_token_secret as string),
    routing: mergeSlackRouting(row.routing),
    installed_at: row.installed_at,
    updated_at: row.updated_at,
  };
}

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_INTEGRATIONS_DEV, request);
    const { searchParams } = new URL(request.url);
    const environment = parseEnv(searchParams.get("environment"));

    const supabase = getSupabaseAdmin();
    const { currentTenantId, requestedScope } = await resolveAdminTenantContext(
      request,
      undefined,
      user.role ?? null
    );
    const readTenantId = requestedScope.scope === "global" ? "" : requestedScope.tenantId ?? currentTenantId;

    const scoped = await fetchScopedSingle<Record<string, unknown>>({
      supabase,
      table: "slack_integration_config",
      tenantId: readTenantId,
      select: "*",
      apply: (q) => q.eq("environment", environment),
      orderBy: { column: "updated_at", ascending: false },
    });

    return successResponse(toSafe(scoped.data as Record<string, unknown> | null));
  } catch (error) {
    return handleApiError(error as Error, "Failed to fetch Slack integration");
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_INTEGRATIONS_DEV, request);
    const body = await request.json();
    const environment = parseEnv(body.environment);

    const supabase = getSupabaseAdmin();
    const { currentTenantId, requestedScope } = await resolveAdminTenantContext(
      request,
      body as Record<string, unknown>,
      user.role ?? null
    );
    const scopeTenantId = requestedScope.scope === "global" ? null : requestedScope.tenantId ?? currentTenantId;

    let beforeQuery = supabase.from("slack_integration_config").select("*").eq("environment", environment);
    beforeQuery =
      scopeTenantId == null ? beforeQuery.is("tenant_id", null) : beforeQuery.eq("tenant_id", scopeTenantId);
    const { data: before } = await beforeQuery.maybeSingle();

    const routing = mergeSlackRouting(body.routing ?? (before as { routing?: unknown })?.routing);

    const payload: Record<string, unknown> = {
      tenant_id: scopeTenantId,
      environment,
      enabled: Boolean(body.enabled),
      routing,
      updated_at: new Date().toISOString(),
    };

    const existingRow = before as { id?: string } | null;
    let after: Record<string, unknown> | null = null;
    let error: unknown = null;

    if (existingRow?.id) {
      const updateRes = await supabase
        .from("slack_integration_config")
        .update(payload)
        .eq("id", existingRow.id)
        .select()
        .single();
      after = updateRes.data as Record<string, unknown> | null;
      error = updateRes.error;
    } else {
      const insertRes = await supabase
        .from("slack_integration_config")
        .insert({
          ...payload,
          enabled: Boolean(body.enabled),
          routing,
        })
        .select()
        .single();
      after = insertRes.data as Record<string, unknown> | null;
      error = insertRes.error;
    }

    if (error) throw error;

    await writeConfigChangeLog({
      changedBy: user.id,
      area: "integration",
      recordKey: `slack.${environment}.${scopeTenantId ?? "global"}`,
      before: before ? (toSafe(before as Record<string, unknown>) as Record<string, unknown>) : null,
      after: toSafe(after) as Record<string, unknown>,
    });

    return successResponse(toSafe(after));
  } catch (error) {
    return handleApiError(error as Error, "Failed to update Slack integration");
  }
}
