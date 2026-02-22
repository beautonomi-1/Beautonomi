import { NextRequest } from "next/server";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { writeConfigChangeLog } from "@/lib/config/config-change-log";

const ENVS = ["production", "staging", "development"];

function parseEnv(s: string | null): string {
  if (s && ENVS.includes(s)) return s;
  return "production";
}

function toSafeSumsubRow(row: Record<string, unknown> | null) {
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
    await requireRoleInApi(["superadmin"], request);
    const { searchParams } = new URL(request.url);
    const environment = parseEnv(searchParams.get("environment"));

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("sumsub_integration_config")
      .select("*")
      .eq("environment", environment)
      .maybeSingle();

    if (error) throw error;
    return successResponse(toSafeSumsubRow(data as Record<string, unknown> | null));
  } catch (error) {
    return handleApiError(error as Error, "Failed to fetch Sumsub config");
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["superadmin"], request);
    const body = await request.json();
    const environment = parseEnv(body.environment);

    const supabase = getSupabaseAdmin();
    const { data: before } = await supabase
      .from("sumsub_integration_config")
      .select("id, environment, enabled, level_name")
      .eq("environment", environment)
      .maybeSingle();

    const payload: Record<string, unknown> = {
      environment,
      enabled: body.enabled ?? false,
      level_name: body.level_name ?? null,
      updated_at: new Date().toISOString(),
    };
    if (body.app_token_secret !== undefined) payload.app_token_secret = body.app_token_secret;
    if (body.secret_key_secret !== undefined) payload.secret_key_secret = body.secret_key_secret;
    if (body.webhook_secret_secret !== undefined) payload.webhook_secret_secret = body.webhook_secret_secret;

    const { data: after, error } = await supabase
      .from("sumsub_integration_config")
      .upsert(payload, { onConflict: "environment" })
      .select()
      .single();

    if (error) throw error;

    await writeConfigChangeLog({
      changedBy: user.id,
      area: "integration",
      recordKey: `sumsub.${environment}`,
      before: before as Record<string, unknown> | null,
      after: toSafeSumsubRow(after as Record<string, unknown>) as Record<string, unknown> | null,
    });

    return successResponse(toSafeSumsubRow(after as Record<string, unknown>));
  } catch (error) {
    return handleApiError(error as Error, "Failed to update Sumsub config");
  }
}
