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
 * GET /api/admin/control-plane/modules/ranking?environment=production
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_PLATFORM_CONFIG, request);
    const { searchParams } = new URL(request.url);
    const environment = parseEnv(searchParams.get("environment"));

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("ranking_module_config")
      .select("*")
      .eq("environment", environment)
      .maybeSingle();

    if (error) throw error;
    return successResponse(data);
  } catch (error) {
    return handleApiError(error as Error, "Failed to fetch ranking module config");
  }
}

/**
 * PUT /api/admin/control-plane/modules/ranking
 * Body: { environment, enabled, weights? }
 */
export async function PUT(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_PLATFORM_CONFIG, request);
    const body = await request.json();
    const environment = parseEnv(body.environment);

    const supabase = getSupabaseAdmin();
    const { data: before } = await supabase
      .from("ranking_module_config")
      .select("*")
      .eq("environment", environment)
      .maybeSingle();

    const payload = {
      environment,
      enabled: body.enabled ?? false,
      weights: body.weights ?? {},
      updated_at: new Date().toISOString(),
    };

    const { data: after, error } = await supabase
      .from("ranking_module_config")
      .upsert(payload, { onConflict: "environment" })
      .select()
      .single();

    if (error) throw error;

    await writeConfigChangeLog({
      changedBy: user.id,
      area: "module",
      recordKey: `ranking.${environment}`,
      before: before as Record<string, any> | null,
      after: after as Record<string, any> | null,
    });

    const reqMeta = extractRequestMeta(request);
    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role,
      action: "admin.control_plane.ranking.update",
      entity_type: "ranking_module_config",
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
    return handleApiError(error as Error, "Failed to update ranking module config");
  }
}
