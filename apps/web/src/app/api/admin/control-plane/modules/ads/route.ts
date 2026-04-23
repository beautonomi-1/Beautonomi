import { NextRequest } from "next/server";
import { requireAdminSection, successResponse, handleApiError  } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PLATFORM_CONFIG } from "@/lib/admin-sections";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { writeConfigChangeLog } from "@/lib/config/config-change-log";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";

const ENVS = ["production", "staging", "development"];

const VALID_AD_MODELS = ["cpc_budget", "impression_pack", "time_based"] as const;

function parseEnv(s: string | null): string {
  if (s && ENVS.includes(s)) return s;
  return "production";
}

function normalizeAdsModels(body: Record<string, unknown>): {
  available_models: string[];
  default_model: string;
} {
  const raw = body.available_models;
  let available = Array.isArray(raw)
    ? raw.filter((m): m is string => typeof m === "string" && VALID_AD_MODELS.includes(m as (typeof VALID_AD_MODELS)[number]))
    : [...VALID_AD_MODELS];
  if (available.length === 0) {
    available = [...VALID_AD_MODELS];
  }
  let defaultModel = typeof body.default_model === "string" ? body.default_model : "time_based";
  if (!VALID_AD_MODELS.includes(defaultModel as (typeof VALID_AD_MODELS)[number]) || !available.includes(defaultModel)) {
    defaultModel = available.includes("time_based") ? "time_based" : available[0];
  }
  return { available_models: available, default_model: defaultModel };
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

    const { available_models, default_model } = normalizeAdsModels(body as Record<string, unknown>);

    const maxSlots =
      body.max_sponsored_slots != null && body.max_sponsored_slots !== ""
        ? Math.min(100, Math.max(0, Math.floor(Number(body.max_sponsored_slots))))
        : null;
    let cpiRatio =
      body.cost_per_impression_ratio != null && body.cost_per_impression_ratio !== ""
        ? Number(body.cost_per_impression_ratio)
        : null;
    if (cpiRatio != null && (Number.isNaN(cpiRatio) || cpiRatio < 0 || cpiRatio > 1)) {
      cpiRatio = null;
    }

    const payload: Record<string, any> = {
      environment,
      enabled: body.enabled ?? false,
      model: default_model,
      disclosure_label: body.disclosure_label ?? null,
      max_sponsored_slots: maxSlots,
      cost_per_impression_ratio: cpiRatio,
      available_models,
      default_model,
      updated_at: new Date().toISOString(),
    };

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

    const reqMeta = extractRequestMeta(request);
    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role,
      action: "admin.control_plane.ads.update",
      entity_type: "ads_module_config",
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
    return handleApiError(error as Error, "Failed to update ads module config");
  }
}
