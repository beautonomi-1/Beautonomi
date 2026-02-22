import { NextRequest } from "next/server";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { writeConfigChangeLog } from "@/lib/config/config-change-log";

const ENVS = ["production", "staging", "development"];

function parseEnv(s: string | null): string {
  if (s && ENVS.includes(s)) return s;
  return "production";
}

function toSafeAuraRow(row: Record<string, unknown> | null) {
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
    await requireRoleInApi(["superadmin"], request);
    const { searchParams } = new URL(request.url);
    const environment = parseEnv(searchParams.get("environment"));

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("aura_integration_config")
      .select("*")
      .eq("environment", environment)
      .maybeSingle();

    if (error) throw error;
    return successResponse(toSafeAuraRow(data as Record<string, unknown> | null));
  } catch (error) {
    return handleApiError(error as Error, "Failed to fetch Aura config");
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["superadmin"], request);
    const body = await request.json();
    const environment = parseEnv(body.environment);

    const supabase = getSupabaseAdmin();
    const { data: before } = await supabase
      .from("aura_integration_config")
      .select("id, environment, enabled, org_id")
      .eq("environment", environment)
      .maybeSingle();

    const payload: Record<string, unknown> = {
      environment,
      enabled: body.enabled ?? false,
      org_id: body.org_id ?? null,
      updated_at: new Date().toISOString(),
    };
    if (body.api_key_secret !== undefined) payload.api_key_secret = body.api_key_secret;

    const { data: after, error } = await supabase
      .from("aura_integration_config")
      .upsert(payload, { onConflict: "environment" })
      .select()
      .single();

    if (error) throw error;

    await writeConfigChangeLog({
      changedBy: user.id,
      area: "integration",
      recordKey: `aura.${environment}`,
      before: before as Record<string, unknown> | null,
      after: toSafeAuraRow(after as Record<string, unknown>) as Record<string, unknown> | null,
    });

    return successResponse(toSafeAuraRow(after as Record<string, unknown>));
  } catch (error) {
    return handleApiError(error as Error, "Failed to update Aura config");
  }
}
