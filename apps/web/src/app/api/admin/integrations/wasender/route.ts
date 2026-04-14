import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection, successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_INTEGRATIONS_DEV } from "@/lib/admin-sections";
import { writeConfigChangeLog } from "@/lib/config/config-change-log";
import { fetchScopedSingle, resolveAdminTenantContext } from "@/lib/tenant/scoped-overrides";

const ENVS = ["production", "staging", "development"];

function parseEnv(s: string | null): string {
  return s && ENVS.includes(s) ? s : "production";
}

function maskSecret(v: string | null | undefined): string | null {
  if (!v) return null;
  if (v.length <= 8) return "***";
  return v.slice(0, 6) + "..." + v.slice(-4);
}

function toSafeRow(row: Record<string, any> | null) {
  if (!row) return null;
  return {
    id: row.id,
    environment: row.environment,
    enabled: row.enabled,
    pat_set: Boolean(row.personal_access_token_secret),
    masked_pat: maskSecret(row.personal_access_token_secret),
    webhook_secret_set: Boolean(row.webhook_secret),
    base_url: row.base_url,
    default_session_id: row.default_session_id,
    bulk_pacing_ms: row.bulk_pacing_ms,
    bulk_batch_size_limit: row.bulk_batch_size_limit,
    daily_send_limit_per_session: row.daily_send_limit_per_session,
    hourly_send_limit_per_session: row.hourly_send_limit_per_session,
    max_concurrent_per_session: row.max_concurrent_per_session,
    auto_pause_on_failure_count: row.auto_pause_on_failure_count,
    cooldown_minutes_after_pause: row.cooldown_minutes_after_pause,
    updated_at: row.updated_at,
  };
}

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_INTEGRATIONS_DEV, request);
    void user;
    const { searchParams } = new URL(request.url);
    const environment = parseEnv(searchParams.get("environment"));

    const supabase = getSupabaseAdmin();
    const { currentTenantId, requestedScope } = await resolveAdminTenantContext(request, undefined, user.role ?? null);
    const readTenantId = requestedScope.scope === "global" ? "" : requestedScope.tenantId ?? currentTenantId;

    const scoped = await fetchScopedSingle<Record<string, any>>({
      supabase,
      table: "wasender_integration_config",
      tenantId: readTenantId,
      select: "*",
      apply: (q) => q.eq("environment", environment),
      orderBy: { column: "updated_at", ascending: false },
    });

    return successResponse(toSafeRow(scoped.data as Record<string, any> | null));
  } catch (error) {
    return handleApiError(error as Error, "Failed to fetch Wasender config");
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_INTEGRATIONS_DEV, request);
    const body = await request.json();
    const environment = parseEnv(body.environment);
    const { currentTenantId, requestedScope } = await resolveAdminTenantContext(
      request,
      body as Record<string, unknown>,
      user.role ?? null,
    );
    const scopeTenantId = requestedScope.scope === "global" ? null : requestedScope.tenantId ?? currentTenantId;

    const supabase = getSupabaseAdmin();

    let beforeQuery = supabase
      .from("wasender_integration_config")
      .select("*")
      .eq("environment", environment);
    beforeQuery = scopeTenantId == null ? beforeQuery.is("tenant_id", null) : beforeQuery.eq("tenant_id", scopeTenantId);
    const { data: before } = await beforeQuery.maybeSingle();

    const payload: Record<string, any> = {
      tenant_id: scopeTenantId,
      environment,
      enabled: body.enabled ?? false,
      base_url: body.base_url || "https://app.wasenderapi.com",
      bulk_pacing_ms: Math.max(3000, Number(body.bulk_pacing_ms) || 5000),
      bulk_batch_size_limit: Math.min(100, Math.max(1, Number(body.bulk_batch_size_limit) || 50)),
      daily_send_limit_per_session: Math.min(500, Math.max(50, Number(body.daily_send_limit_per_session) || 200)),
      hourly_send_limit_per_session: Math.min(60, Math.max(10, Number(body.hourly_send_limit_per_session) || 30)),
      max_concurrent_per_session: Math.min(3, Math.max(1, Number(body.max_concurrent_per_session) || 1)),
      auto_pause_on_failure_count: Math.min(20, Math.max(1, Number(body.auto_pause_on_failure_count) || 3)),
      cooldown_minutes_after_pause: Math.min(1440, Math.max(5, Number(body.cooldown_minutes_after_pause) || 30)),
      default_session_id: body.default_session_id || null,
      updated_at: new Date().toISOString(),
    };

    if (body.personal_access_token_secret !== undefined && body.personal_access_token_secret !== "***") {
      payload.personal_access_token_secret = body.personal_access_token_secret?.trim() || null;
    }
    if (body.webhook_secret !== undefined && body.webhook_secret !== "***") {
      payload.webhook_secret = body.webhook_secret?.trim() || null;
    }

    const existingRow = before as { id?: string } | null;
    let after: Record<string, any> | null = null;
    let error: unknown = null;

    if (existingRow?.id) {
      const updateRes = await supabase
        .from("wasender_integration_config")
        .update(payload)
        .eq("id", existingRow.id)
        .select()
        .single();
      after = updateRes.data as Record<string, any> | null;
      error = updateRes.error;
    } else {
      const insertRes = await supabase
        .from("wasender_integration_config")
        .insert(payload)
        .select()
        .single();
      after = insertRes.data as Record<string, any> | null;
      error = insertRes.error;
    }

    if (error) throw error;

    await writeConfigChangeLog({
      changedBy: user.id,
      area: "integration",
      recordKey: `wasender.${environment}.${scopeTenantId ?? "global"}`,
      before: before ? toSafeRow(before as Record<string, any>) as Record<string, any> : null,
      after: toSafeRow(after) as Record<string, any>,
    });

    return successResponse(toSafeRow(after));
  } catch (error) {
    return handleApiError(error as Error, "Failed to update Wasender config");
  }
}
