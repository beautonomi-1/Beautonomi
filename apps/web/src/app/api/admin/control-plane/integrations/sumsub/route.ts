import { NextRequest } from "next/server";
import { requireAdminSection, successResponse, handleApiError  } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PLATFORM_CONFIG } from "@/lib/admin-sections";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { writeConfigChangeLog } from "@/lib/config/config-change-log";
import { fetchScopedSingle, resolveAdminTenantContext } from "@/lib/tenant/scoped-overrides";

const ENVS = ["production", "staging", "development"];

function parseEnv(s: string | null): string {
  if (s && ENVS.includes(s)) return s;
  return "production";
}

function toSafeSumsubRow(row: Record<string, any> | null) {
  if (!row) return null;
  return {
    id: row.id,
    environment: row.environment,
    enabled: row.enabled,
    level_name: row.level_name,
    app_token_set: Boolean(row.app_token_secret),
    secret_key_set: Boolean(row.secret_key_secret),
    webhook_secret_set: Boolean(row.webhook_secret_secret),
    updated_at: row.updated_at,
  };
}

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_PLATFORM_CONFIG, request);
    const { searchParams } = new URL(request.url);
    const environment = parseEnv(searchParams.get("environment"));

    const supabase = getSupabaseAdmin();
    const { currentTenantId, requestedScope } = await resolveAdminTenantContext(
      request,
      undefined,
      user.role ?? null
    );
    const readTenantId =
      requestedScope.scope === "global" ? "" : requestedScope.tenantId ?? currentTenantId;
    const scoped = await fetchScopedSingle<Record<string, any>>({
      supabase,
      table: "sumsub_integration_config",
      tenantId: readTenantId,
      select: "*",
      apply: (q) => q.eq("environment", environment),
      orderBy: { column: "updated_at", ascending: false },
    });
    const row = scoped.data as (Record<string, any> & { tenant_id?: string | null }) | null;
    const isGlobal = !row?.tenant_id;
    return successResponse({
      ...toSafeSumsubRow(row),
      _scope: isGlobal ? "global" : "tenant",
      _tenant_id: row?.tenant_id ?? null,
    });
  } catch (error) {
    return handleApiError(error as Error, "Failed to fetch Sumsub config");
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_PLATFORM_CONFIG, request);
    const body = await request.json();
    const environment = parseEnv(body.environment);
    const { currentTenantId, requestedScope } = await resolveAdminTenantContext(
      request,
      body as Record<string, unknown>,
      user.role ?? null
    );
    const scopeTenantId = requestedScope.scope === "global" ? null : requestedScope.tenantId ?? currentTenantId;

    const supabase = getSupabaseAdmin();
    let beforeQuery = supabase
      .from("sumsub_integration_config")
      .select("id, environment, enabled, level_name")
      .eq("environment", environment);
    beforeQuery =
      scopeTenantId == null ? beforeQuery.is("tenant_id", null) : beforeQuery.eq("tenant_id", scopeTenantId);
    const { data: before } = await beforeQuery.maybeSingle();

    const payload: Record<string, any> = {
      tenant_id: scopeTenantId,
      environment,
      enabled: body.enabled ?? false,
      level_name: body.level_name ?? null,
      updated_at: new Date().toISOString(),
    };
    if (body.app_token_secret !== undefined) payload.app_token_secret = body.app_token_secret;
    if (body.secret_key_secret !== undefined) payload.secret_key_secret = body.secret_key_secret;
    if (body.webhook_secret_secret !== undefined) payload.webhook_secret_secret = body.webhook_secret_secret;

    const existingRow = before as { id?: string } | null;
    let after: Record<string, any> | null = null;
    let error: unknown = null;
    if (existingRow?.id) {
      const updateRes = await supabase
        .from("sumsub_integration_config")
        .update(payload)
        .eq("id", existingRow.id)
        .select()
        .single();
      after = updateRes.data as Record<string, any> | null;
      error = updateRes.error;
    } else {
      const insertRes = await supabase
        .from("sumsub_integration_config")
        .insert(payload)
        .select()
        .single();
      after = insertRes.data as Record<string, any> | null;
      error = insertRes.error;
    }

    if (error) throw error;

    // Keep verification.sumsub.enabled feature flag in sync with the integration enabled field,
    // so the policy resolver (which now reads the flag) stays consistent with the admin toggle.
    try {
      const flagTenantId = scopeTenantId;
      const supabaseForFlag = getSupabaseAdmin();
      const { data: existingFlag } = await supabaseForFlag
        .from("feature_flags")
        .select("id")
        .eq("feature_key", "verification.sumsub.enabled")
        .filter("tenant_id", flagTenantId == null ? "is" : "eq", flagTenantId == null ? "null" : flagTenantId)
        .maybeSingle();
      if (existingFlag?.id) {
        await supabaseForFlag
          .from("feature_flags")
          .update({ enabled: payload.enabled, updated_at: new Date().toISOString() })
          .eq("id", existingFlag.id);
      } else {
        await supabaseForFlag.from("feature_flags").insert({
          feature_key: "verification.sumsub.enabled",
          feature_name: "Sumsub verification",
          description: "Synced from Control plane → Integrations → Sumsub",
          enabled: payload.enabled,
          category: "control_plane",
          tenant_id: flagTenantId,
        });
      }
    } catch (flagSyncErr) {
      console.warn("[sumsub PUT] flag sync failed (non-fatal):", flagSyncErr);
    }

    await writeConfigChangeLog({
      changedBy: user.id,
      area: "integration",
      recordKey: `sumsub.${environment}.${scopeTenantId ?? "global"}`,
      before: before as Record<string, any> | null,
      after: toSafeSumsubRow(after as Record<string, any>) as Record<string, any> | null,
    });

    return successResponse(toSafeSumsubRow(after as Record<string, any>));
  } catch (error) {
    return handleApiError(error as Error, "Failed to update Sumsub config");
  }
}
