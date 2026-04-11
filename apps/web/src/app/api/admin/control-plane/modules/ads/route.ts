import { NextRequest } from "next/server";
import { requireAdminSection, successResponse, handleApiError  } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PLATFORM_CONFIG } from "@/lib/admin-sections";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { writeConfigChangeLog } from "@/lib/config/config-change-log";

const ENVS = ["production", "staging", "development"];

function parseEnv(s: string | null): string {
  if (s && ENVS.includes(s)) return s;
  return "production";
}

/**
 * GET /api/admin/control-plane/modules/ads?environment=production
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_PLATFORM_CONFIG, request);
    const { searchParams } = new URL(request.url);
    const environment = parseEnv(searchParams.get("environment"));

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("ads_module_config")
      .select("*")
      .eq("environment", environment)
      .maybeSingle();

    if (error) throw error;
    return successResponse(data);
  } catch (error) {
    return handleApiError(error as Error, "Failed to fetch ads module config");
  }
}

/**
 * PUT /api/admin/control-plane/modules/ads
 * Body: { environment, enabled, model?, disclosure_label?, max_sponsored_slots? }
 */
export async function PUT(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_PLATFORM_CONFIG, request);
    const body = await request.json();
    const environment = parseEnv(body.environment);

    const supabase = getSupabaseAdmin();
    const { data: before } = await supabase
      .from("ads_module_config")
      .select("*")
      .eq("environment", environment)
      .maybeSingle();

    const payload: Record<string, any> = {
      environment,
      enabled: body.enabled ?? false,
      model: body.model ?? null,
      disclosure_label: body.disclosure_label ?? null,
      max_sponsored_slots: body.max_sponsored_slots ?? null,
      cost_per_impression_ratio: body.cost_per_impression_ratio != null ? Number(body.cost_per_impression_ratio) : null,
      updated_at: new Date().toISOString(),
    };
    if (body.available_models !== undefined) {
      const validModels = ["cpc_budget", "impression_pack", "time_based"];
      payload.available_models = Array.isArray(body.available_models)
        ? body.available_models.filter((m: string) => validModels.includes(m))
        : validModels;
    }
    if (body.default_model !== undefined) {
      payload.default_model = body.default_model ?? "time_based";
    }

    const { data: after, error } = await supabase
      .from("ads_module_config")
      .upsert(payload, { onConflict: "environment" })
      .select()
      .single();

    if (error) throw error;

    await writeConfigChangeLog({
      changedBy: user.id,
      area: "module",
      recordKey: `ads.${environment}`,
      before: before as Record<string, any> | null,
      after: after as Record<string, any> | null,
    });

    return successResponse(after);
  } catch (error) {
    return handleApiError(error as Error, "Failed to update ads module config");
  }
}
