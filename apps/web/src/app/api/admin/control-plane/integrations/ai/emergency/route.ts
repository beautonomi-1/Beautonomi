import { NextRequest } from "next/server";
import { requireAdminSection, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PLATFORM_CONFIG } from "@/lib/admin-sections";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { writeConfigChangeLog } from "@/lib/config/config-change-log";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";
import { invalidateAiRuntimeCache } from "@/lib/ai/resolve-runtime";
import { toSafeEmergencyRow } from "@/lib/ai/safe-config";
import { slackNotifyAiEmergencyActivated } from "@/lib/ai/alerts";

function parseEnv(s: string | null): string {
  const ENVS = ["production", "staging", "development"];
  if (s && ENVS.includes(s)) return s;
  return "production";
}

/** POST /api/admin/control-plane/integrations/ai/emergency */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_PLATFORM_CONFIG, request);
    const body = await request.json();
    const environment = parseEnv(body.environment ?? null);
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (!reason && (body.stop_all_calls || body.force_template_fallback)) {
      return handleApiError(new Error("Reason required for emergency activation"), "Reason required");
    }

    const supabase = getSupabaseAdmin();
    const { data: before } = await supabase
      .from("ai_emergency_controls")
      .select("*")
      .eq("environment", environment)
      .maybeSingle();

    const prev = (before ?? {}) as Record<string, unknown>;
    const payload = {
      environment,
      stop_all_calls: body.stop_all_calls !== undefined ? Boolean(body.stop_all_calls) : Boolean(prev.stop_all_calls),
      force_template_fallback:
        body.force_template_fallback !== undefined
          ? Boolean(body.force_template_fallback)
          : Boolean(prev.force_template_fallback),
      disable_streaming:
        body.disable_streaming !== undefined ? Boolean(body.disable_streaming) : Boolean(prev.disable_streaming),
      disable_vision: body.disable_vision !== undefined ? Boolean(body.disable_vision) : Boolean(prev.disable_vision),
      disable_embeddings:
        body.disable_embeddings !== undefined ? Boolean(body.disable_embeddings) : Boolean(prev.disable_embeddings),
      activated_by: user.id,
      activated_at: new Date().toISOString(),
      reason: reason || (prev.reason as string | null) || null,
    };

    const { data: after, error } = await supabase
      .from("ai_emergency_controls")
      .upsert(payload, { onConflict: "environment" })
      .select()
      .single();
    if (error) throw error;

    invalidateAiRuntimeCache();

    slackNotifyAiEmergencyActivated({
      environment,
      activatedBy: user.id,
      controls: {
        stop_all_calls: payload.stop_all_calls,
        force_template_fallback: payload.force_template_fallback,
      },
      reason,
    });

    await writeConfigChangeLog({
      changedBy: user.id,
      area: "integration",
      recordKey: `ai.emergency.${environment}`,
      before: toSafeEmergencyRow(before as Record<string, unknown> | null) as Record<string, unknown> | null,
      after: toSafeEmergencyRow(after as Record<string, unknown>) as Record<string, unknown>,
    });

    const reqMeta = extractRequestMeta(request);
    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role,
      action: "admin.control_plane.ai.emergency",
      entity_type: "ai_emergency_controls",
      module: "platform_config",
      risk_level: "critical",
      retention_tier: "access",
      status: "succeeded",
      reason,
      ip_address: reqMeta.ip_address,
      user_agent: reqMeta.user_agent,
      after_json: toSafeEmergencyRow(after as Record<string, unknown>) as Record<string, unknown>,
    });

    return successResponse(toSafeEmergencyRow(after as Record<string, unknown>));
  } catch (error) {
    return handleApiError(error as Error, "Failed to update AI emergency controls");
  }
}
