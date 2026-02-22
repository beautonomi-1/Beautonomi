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
 * GET /api/admin/control-plane/modules/on-demand?environment=production
 */
export async function GET(request: NextRequest) {
  try {
    await requireRoleInApi(["superadmin"], request);
    const { searchParams } = new URL(request.url);
    const environment = parseEnv(searchParams.get("environment"));

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("on_demand_module_config")
      .select("*")
      .eq("environment", environment)
      .maybeSingle();

    if (error) throw error;
    return successResponse(data);
  } catch (error) {
    return handleApiError(error as Error, "Failed to fetch on-demand config");
  }
}

/**
 * PUT /api/admin/control-plane/modules/on-demand
 * Body: { environment, enabled, ringtone_asset_path?, ring_duration_seconds?, ... }
 */
export async function PUT(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["superadmin"], request);
    const body = await request.json();
    const environment = parseEnv(body.environment);

    const supabase = getSupabaseAdmin();
    const { data: before } = await supabase
      .from("on_demand_module_config")
      .select("*")
      .eq("environment", environment)
      .maybeSingle();

    const payload = {
      environment,
      enabled: body.enabled ?? false,
      ringtone_asset_path: body.ringtone_asset_path ?? null,
      ring_duration_seconds: body.ring_duration_seconds ?? 20,
      ring_repeat: body.ring_repeat ?? true,
      waiting_screen_timeout_seconds: body.waiting_screen_timeout_seconds ?? 45,
      provider_accept_window_seconds: body.provider_accept_window_seconds ?? 30,
      ui_copy: body.ui_copy ?? {},
      updated_at: new Date().toISOString(),
    };

    const { data: after, error } = await supabase
      .from("on_demand_module_config")
      .upsert(payload, { onConflict: "environment" })
      .select()
      .single();

    if (error) throw error;

    await writeConfigChangeLog({
      changedBy: user.id,
      area: "module",
      recordKey: `on_demand.${environment}`,
      before: before as Record<string, unknown> | null,
      after: after as Record<string, unknown> | null,
    });

    return successResponse(after);
  } catch (error) {
    return handleApiError(error as Error, "Failed to update on-demand config");
  }
}
