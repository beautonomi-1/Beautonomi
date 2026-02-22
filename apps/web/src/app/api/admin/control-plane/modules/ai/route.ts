import { NextRequest } from "next/server";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { writeConfigChangeLog } from "@/lib/config/config-change-log";

const ENVS = ["production", "staging", "development"];

function parseEnv(s: string | null): string {
  if (s && ENVS.includes(s)) return s;
  return "production";
}

/**
 * GET /api/admin/control-plane/modules/ai?environment=production
 */
export async function GET(request: NextRequest) {
  try {
    await requireRoleInApi(["superadmin"], request);
    const { searchParams } = new URL(request.url);
    const environment = parseEnv(searchParams.get("environment"));

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("ai_module_config")
      .select("*")
      .eq("environment", environment)
      .maybeSingle();

    if (error) throw error;
    return successResponse(data);
  } catch (error) {
    return handleApiError(error as Error, "Failed to fetch AI module config");
  }
}

/**
 * PUT /api/admin/control-plane/modules/ai
 * Body: { environment, enabled, sampling_rate?, cache_ttl_seconds?, ... }
 */
export async function PUT(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["superadmin"], request);
    const body = await request.json();
    const environment = parseEnv(body.environment);

    const supabase = getSupabaseAdmin();
    const { data: before } = await supabase
      .from("ai_module_config")
      .select("*")
      .eq("environment", environment)
      .maybeSingle();

    const payload = {
      environment,
      enabled: body.enabled ?? false,
      sampling_rate: body.sampling_rate ?? 0,
      cache_ttl_seconds: body.cache_ttl_seconds ?? 86400,
      default_model_tier: body.default_model_tier ?? "cheap",
      max_tokens: body.max_tokens ?? 600,
      temperature: body.temperature ?? 0.3,
      daily_budget_credits: body.daily_budget_credits ?? 0,
      per_provider_calls_per_day: body.per_provider_calls_per_day ?? 0,
      per_user_calls_per_day: body.per_user_calls_per_day ?? 0,
      updated_at: new Date().toISOString(),
    };

    const { data: after, error } = await supabase
      .from("ai_module_config")
      .upsert(payload, { onConflict: "environment" })
      .select()
      .single();

    if (error) throw error;

    await writeConfigChangeLog({
      changedBy: user.id,
      area: "module",
      recordKey: `ai.${environment}`,
      before: before as Record<string, unknown> | null,
      after: after as Record<string, unknown> | null,
    });

    return successResponse(after);
  } catch (error) {
    return handleApiError(error as Error, "Failed to update AI module config");
  }
}
