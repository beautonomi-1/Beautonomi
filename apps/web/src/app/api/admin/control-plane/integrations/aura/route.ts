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

function toSafeAuraRow(row: Record<string, any> | null) {
  if (!row) return null;
  return {
    id: row.id,
    environment: row.environment,
    enabled: row.enabled,
    org_id: row.org_id,
    api_key_set: Boolean(row.api_key_secret),
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
      table: "aura_integration_config",
      tenantId: readTenantId,
      select: "*",
      apply: (q) => q.eq("environment", environment),
      orderBy: { column: "updated_at", ascending: false },
    });
    return successResponse(toSafeAuraRow(scoped.data as Record<string, any> | null));
  } catch (error) {
    return handleApiError(error as Error, "Failed to fetch Aura config");
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
      .from("aura_integration_config")
      .select("id, environment, enabled, org_id")
      .eq("environment", environment);
    beforeQuery =
      scopeTenantId == null ? beforeQuery.is("tenant_id", null) : beforeQuery.eq("tenant_id", scopeTenantId);
    const { data: before } = await beforeQuery.maybeSingle();

    const payload: Record<string, any> = {
      tenant_id: scopeTenantId,
      environment,
      enabled: body.enabled ?? false,
      org_id: body.org_id ?? null,
      updated_at: new Date().toISOString(),
    };
    if (body.api_key_secret !== undefined) payload.api_key_secret = body.api_key_secret;

    const existingRow = before as { id?: string } | null;
    let after: Record<string, any> | null = null;
    let error: unknown = null;
    if (existingRow?.id) {
      const updateRes = await supabase
        .from("aura_integration_config")
        .update(payload)
        .eq("id", existingRow.id)
        .select()
        .single();
      after = updateRes.data as Record<string, any> | null;
      error = updateRes.error;
    } else {
      const insertRes = await supabase
        .from("aura_integration_config")
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
      recordKey: `aura.${environment}.${scopeTenantId ?? "global"}`,
      before: before as Record<string, any> | null,
      after: toSafeAuraRow(after as Record<string, any>) as Record<string, any> | null,
    });

    return successResponse(toSafeAuraRow(after as Record<string, any>));
  } catch (error) {
    return handleApiError(error as Error, "Failed to update Aura config");
  }
}
