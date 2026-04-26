import { NextRequest } from "next/server";
import { requireAdminSection, successResponse, handleApiError  } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PLATFORM_CONFIG } from "@/lib/admin-sections";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { writeConfigChangeLog } from "@/lib/config/config-change-log";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";

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
    await requireAdminSection(ADMIN_SECTION_PLATFORM_CONFIG, request);
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
 * Body: { environment, enabled, ringtone_asset_path?, normal_booking_ringtone_asset_path?, ... }
 */
export async function PUT(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_PLATFORM_CONFIG, request);
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
      normal_booking_ringtone_asset_path: body.normal_booking_ringtone_asset_path ?? null,
      normal_booking_ring_duration_seconds: body.normal_booking_ring_duration_seconds ?? 20,
      normal_booking_ring_repeat: body.normal_booking_ring_repeat ?? true,
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
      before: before as Record<string, any> | null,
      after: after as Record<string, any> | null,
    });

    const reqMeta = extractRequestMeta(request);
    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role,
      action: "admin.control_plane.on_demand.update",
      entity_type: "on_demand_module_config",
      module: "platform_config",
      risk_level: "high",
      retention_tier: "access",
      status: "succeeded",
      before_json: before as Record<string, any> | null,
      after_json: after as Record<string, any> | null,
      ip_address: reqMeta.ip_address,
      user_agent: reqMeta.user_agent,
      superadmin_bypass_used: user.role === "superadmin",
    });

    return successResponse(after);
  } catch (error) {
    return handleApiError(error as Error, "Failed to update on-demand config");
  }
}
