import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type {
  AgentEmergencyControls,
  AgentModuleConfig,
  AgentOperationalState,
  ToolGrant,
} from "@beautonomi/agent-policy";

function parseEnv(env?: string | null): string {
  if (env === "staging" || env === "development") return env;
  return "production";
}

export async function loadAgentModuleConfig(environment?: string): Promise<AgentModuleConfig> {
  const supabase = getSupabaseAdmin();
  const env = parseEnv(environment ?? process.env.VERCEL_ENV ?? "production");
  const { data } = await supabase.from("agent_module_config").select("*").eq("environment", env).maybeSingle();
  return {
    environment: env,
    masterEnabled: Boolean(data?.master_enabled),
    shadowMode: data?.shadow_mode !== false,
    globalDailySpendCapUsd: data?.global_daily_spend_cap_usd != null ? Number(data.global_daily_spend_cap_usd) : null,
  };
}

export async function loadAgentEmergencyControls(environment?: string): Promise<AgentEmergencyControls> {
  const supabase = getSupabaseAdmin();
  const env = parseEnv(environment ?? process.env.VERCEL_ENV ?? "production");
  const { data } = await supabase.from("agent_emergency_controls").select("*").eq("environment", env).maybeSingle();
  return {
    stopNewRuns: Boolean(data?.stop_new_runs),
    stopAllToolCalls: Boolean(data?.stop_all_tool_calls),
    blockApprovedExecution: Boolean(data?.block_approved_execution),
    freezePendingProposals: Boolean(data?.freeze_pending_proposals),
    allowReadonlyCompletion: data?.allow_readonly_completion !== false,
  };
}

export async function loadAgentOperationalState(agentKey: string): Promise<AgentOperationalState & { agentId: string }> {
  const supabase = getSupabaseAdmin();
  const { data: def } = await supabase.from("agent_definitions").select("id").eq("key", agentKey).maybeSingle();
  if (!def) throw new Error(`Unknown agent: ${agentKey}`);
  const { data } = await supabase
    .from("agent_operational_state")
    .select("state")
    .eq("agent_id", def.id)
    .maybeSingle();
  return {
    agentId: def.id,
    state: (data?.state as AgentOperationalState["state"]) ?? "disabled",
  };
}

export async function loadToolGrant(agentId: string, toolName: string, toolVersion = "1"): Promise<ToolGrant | null> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("agent_tool_grants")
    .select("*")
    .eq("agent_id", agentId)
    .eq("tool_name", toolName)
    .eq("tool_version", toolVersion)
    .eq("active", true)
    .maybeSingle();
  if (!data) return null;
  return {
    toolName: data.tool_name,
    toolVersion: data.tool_version,
    riskCeiling: data.risk_ceiling as ToolGrant["riskCeiling"],
    maxRows: data.max_rows,
    maxOutputBytes: data.max_output_bytes,
    active: data.active,
  };
}

export async function loadAgentDefinition(agentKey: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("agent_definitions").select("*").eq("key", agentKey).maybeSingle();
  if (error) throw error;
  return data;
}
