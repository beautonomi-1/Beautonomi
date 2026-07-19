import { NextRequest } from "next/server";
import { requireAdminSection, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PLATFORM_CONFIG } from "@/lib/admin-sections";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { writeConfigChangeLog } from "@/lib/config/config-change-log";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";
import { slackNotifyAgentEmergencyActivated } from "@/lib/integrations/slack/agent-triggers";

const ENVS = ["production", "staging", "development"];

function parseEnv(s: string | null): string {
  if (s && ENVS.includes(s)) return s;
  return "production";
}

export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_PLATFORM_CONFIG, request);
    const { searchParams } = new URL(request.url);
    const environment = parseEnv(searchParams.get("environment"));
    const supabase = getSupabaseAdmin();

    const [moduleRes, agentsRes, emergencyRes, statesRes] = await Promise.all([
      supabase.from("agent_module_config").select("*").eq("environment", environment).maybeSingle(),
      supabase.from("agent_definitions").select("*"),
      supabase.from("agent_emergency_controls").select("*").eq("environment", environment).maybeSingle(),
      supabase.from("agent_operational_state").select("*"),
    ]);

    const stateByAgent = new Map((statesRes.data ?? []).map((s) => [s.agent_id, s]));

    return successResponse({
      module: moduleRes.data,
      agents: (agentsRes.data ?? []).map((a) => ({
        ...a,
        agent_operational_state: stateByAgent.get(a.id) ?? null,
      })),
      emergency: emergencyRes.data,
    });
  } catch (error) {
    return handleApiError(error as Error, "Failed to fetch agent module config");
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_PLATFORM_CONFIG, request);
    const body = await request.json();
    const environment = parseEnv(body.environment);
    const supabase = getSupabaseAdmin();

    const { data: before } = await supabase
      .from("agent_module_config")
      .select("*")
      .eq("environment", environment)
      .maybeSingle();

    // Preserve fields not present in the request body (partial updates from console toggles).
    const payload = {
      environment,
      master_enabled: body.master_enabled ?? before?.master_enabled ?? false,
      shadow_mode: body.shadow_mode ?? before?.shadow_mode ?? true,
      global_daily_spend_cap_usd:
        body.global_daily_spend_cap_usd !== undefined
          ? body.global_daily_spend_cap_usd
          : before?.global_daily_spend_cap_usd ?? null,
      default_routing_policy_id:
        body.default_routing_policy_id !== undefined
          ? body.default_routing_policy_id
          : before?.default_routing_policy_id ?? null,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    };

    const { data: after, error } = await supabase
      .from("agent_module_config")
      .upsert(payload, { onConflict: "environment" })
      .select()
      .single();
    if (error) throw error;

    if (body.agent_state?.agent_id && ["active", "paused", "draining", "disabled"].includes(body.agent_state.state)) {
      await supabase.from("agent_operational_state").upsert(
        {
          agent_id: body.agent_state.agent_id,
          state: body.agent_state.state,
          updated_by: user.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "agent_id" },
      );
    }

    if (body.emergency) {
      await supabase.from("agent_emergency_controls").upsert(
        {
          environment,
          stop_new_runs: Boolean(body.emergency.stop_new_runs),
          stop_all_tool_calls: Boolean(body.emergency.stop_all_tool_calls),
          block_approved_execution: Boolean(body.emergency.block_approved_execution),
          freeze_pending_proposals: Boolean(body.emergency.freeze_pending_proposals),
          allow_readonly_completion: body.emergency.allow_readonly_completion !== false,
          activated_by: user.id,
          activated_at: new Date().toISOString(),
          reason: body.emergency.reason ?? null,
        },
        { onConflict: "environment" },
      );
      slackNotifyAgentEmergencyActivated({
        environment,
        activatedBy: user.id,
        controls: {
          stop_new_runs: Boolean(body.emergency.stop_new_runs),
          stop_all_tool_calls: Boolean(body.emergency.stop_all_tool_calls),
          block_approved_execution: Boolean(body.emergency.block_approved_execution),
          freeze_pending_proposals: Boolean(body.emergency.freeze_pending_proposals),
        },
        reason: body.emergency.reason ?? null,
      });
    }

    await writeConfigChangeLog({
      changedBy: user.id,
      area: "module",
      recordKey: `agents.${environment}`,
      before: before as Record<string, unknown> | null,
      after: after as Record<string, unknown>,
    });

    const reqMeta = extractRequestMeta(request);
    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role,
      action: "admin.control_plane.agents.update",
      entity_type: "agent_module_config",
      module: "platform_config",
      risk_level: "high",
      retention_tier: "access",
      status: "succeeded",
      before_json: before as Record<string, unknown> | null,
      after_json: after as Record<string, unknown>,
      ip_address: reqMeta.ip_address,
      user_agent: reqMeta.user_agent,
      superadmin_bypass_used: user.role === "superadmin",
    });

    return successResponse(after);
  } catch (error) {
    return handleApiError(error as Error, "Failed to update agent module config");
  }
}
