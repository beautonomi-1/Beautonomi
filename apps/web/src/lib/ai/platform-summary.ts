/**
 * Unified AI Platform + agent workforce summary for admin hub.
 */
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  loadAgentEmergencyControls,
  loadAgentModuleConfig,
} from "@/lib/agents/config-loader";
import { assertAgentMutationAllowed, describeAgentGates } from "@/lib/agents/safety-gate";
import { canEnableCatalogModel } from "@/lib/ai/eval-gate";
import type { DbCatalogRow } from "@/lib/ai/merge-catalog";

export const AGENT_CRON_SCHEDULES = [
  { name: "agent-workforce-sweep", schedule: "*/30 * * * *", path: "/api/cron/agent-workforce-sweep" },
  { name: "agent-provider-ops", schedule: "30 5 * * *", path: "/api/cron/agent-provider-ops" },
  { name: "agent-ops-sentinel", schedule: "0 */6 * * *", path: "/api/cron/agent-ops-sentinel" },
  { name: "agent-provider-digest", schedule: "0 6 * * 1", path: "/api/cron/agent-provider-digest" },
] as const;

const CRON_LABELS_BY_AGENT: Record<string, string[]> = {
  "ops-sentinel": ["agent-ops-sentinel (every 6h)"],
  "support-triage": ["agent-workforce-sweep (every 30m)"],
  "support-lead": ["agent-workforce-sweep (every 30m)"],
  "payout-review": ["agent-workforce-sweep (every 30m)"],
  "reconciliation-investigator": ["agent-workforce-sweep (every 30m)"],
  "refund-specialist": ["agent-workforce-sweep (every 30m)"],
  "trust-monitor": ["agent-workforce-sweep (every 30m)", "agent-provider-ops (daily)"],
  "content-moderator": ["agent-workforce-sweep (every 30m)"],
  "provider-success": ["agent-provider-ops (daily)", "agent-provider-digest (weekly Mon)"],
  "membership-shepherd": ["agent-provider-ops (daily)"],
  "admin-copilot": ["On-demand (Admin Copilot API)"],
};

const EXPECTED_AGENT_KEYS = [
  "ops-sentinel",
  "support-triage",
  "support-lead",
  "payout-review",
  "reconciliation-investigator",
  "refund-specialist",
  "provider-success",
  "membership-shepherd",
  "trust-monitor",
  "content-moderator",
  "admin-copilot",
] as const;

function catalogModelValid(params: {
  environment: string;
  modelId: string | null | undefined;
  enabledModelIds: Set<string>;
  evalByModelId: Map<string, string | null>;
}): boolean {
  if (!params.modelId) return true;
  if (!params.enabledModelIds.has(params.modelId)) return false;
  const gate = canEnableCatalogModel({
    environment: params.environment,
    enabled: true,
    evalPassedAt: params.evalByModelId.get(params.modelId) ?? null,
  });
  return gate.allowed;
}

export async function loadAiPlatformWorkforceSummary(params: {
  environment: string;
  dbCatalogRows: DbCatalogRow[];
  monthlyBudgetUsd: number | null;
}) {
  const supabase = getSupabaseAdmin();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
  const monthStart = `${new Date().toISOString().slice(0, 7)}-01`;
  const today = new Date().toISOString().slice(0, 10);

  const [agentModule, agentEmergency, agentsRes, statesRes, pendingRes, usageMonthRes, usageTodayRes, usage7dRes] =
    await Promise.all([
      loadAgentModuleConfig(params.environment),
      loadAgentEmergencyControls(params.environment),
      supabase
        .from("agent_definitions")
        .select(
          "id, key, display_name, admin_role, risk_ceiling, active_version, allowed_workflow_types, preferred_model_id, fallback_model_id, task_default, vision_enabled, reply_locale_mode, max_cost_usd_per_run",
        ),
      supabase.from("agent_operational_state").select("agent_id, state"),
      supabase
        .from("agent_actions")
        .select("id", { count: "exact", head: true })
        .in("status", ["proposed", "approval_pending"]),
      supabase.from("ai_usage_log").select("cost_estimate, agent_id, feature_key").gte("created_at", `${monthStart}T00:00:00Z`),
      supabase.from("ai_usage_log").select("cost_estimate, agent_id, feature_key").gte("created_at", `${today}T00:00:00Z`),
      supabase.from("ai_usage_log").select("cost_estimate, agent_id").gte("created_at", sevenDaysAgo),
    ]);

  const rlsHarnessGreen = process.env.AGENT_RLS_HARNESS_GREEN === "true";
  const p0MigrationsVerified = process.env.AGENT_P0_MIGRATIONS_VERIFIED === "true";

  const gates = describeAgentGates({
    rlsHarnessGreen,
    p0MigrationsVerified,
    masterEnabled: agentModule.masterEnabled,
    shadowMode: agentModule.shadowMode,
    emergency: {
      stopNewRuns: agentEmergency.stopNewRuns,
      stopAllToolCalls: agentEmergency.stopAllToolCalls,
      blockApprovedExecution: agentEmergency.blockApprovedExecution,
      freezePendingProposals: agentEmergency.freezePendingProposals,
    },
  });

  const mutationGate = assertAgentMutationAllowed({
    rlsHarnessGreen,
    masterEnabled: agentModule.masterEnabled,
    shadowMode: agentModule.shadowMode,
    p0MigrationsVerified,
  });

  const stateByAgent = new Map(
    ((statesRes.data ?? []) as Array<{ agent_id: string; state: string }>).map((s) => [s.agent_id, s.state]),
  );

  const enabledModelIds = new Set(
    params.dbCatalogRows.filter((r) => r.enabled).map((r) => r.model_id),
  );
  const evalByModelId = new Map(
    params.dbCatalogRows.map((r) => [r.model_id, r.eval_passed_at ?? null]),
  );

  const spend7dByAgent = new Map<string, number>();
  for (const row of usage7dRes.data ?? []) {
    const r = row as { agent_id?: string | null; cost_estimate?: number };
    if (!r.agent_id) continue;
    spend7dByAgent.set(r.agent_id, (spend7dByAgent.get(r.agent_id) ?? 0) + Number(r.cost_estimate ?? 0));
  }

  let platformMonthUsd = 0;
  let agentMonthUsd = 0;
  let providerAiMonthUsd = 0;
  for (const row of usageMonthRes.data ?? []) {
    const r = row as { cost_estimate?: number; agent_id?: string | null; feature_key?: string };
    const cost = Number(r.cost_estimate ?? 0);
    platformMonthUsd += cost;
    if (r.agent_id) agentMonthUsd += cost;
    else if (String(r.feature_key ?? "").startsWith("agent.")) agentMonthUsd += cost;
    else providerAiMonthUsd += cost;
  }

  let platformTodayUsd = 0;
  for (const row of usageTodayRes.data ?? []) {
    platformTodayUsd += Number((row as { cost_estimate?: number }).cost_estimate ?? 0);
  }

  const agentsDb = (agentsRes.data ?? []) as Array<Record<string, unknown>>;
  const agentsByKey = new Map(agentsDb.map((a) => [String(a.key), a]));

  const agents = EXPECTED_AGENT_KEYS.map((key) => {
    const row = agentsByKey.get(key);
    if (!row) {
      return {
        id: null,
        key,
        display_name: key,
        admin_role: null,
        risk_ceiling: null,
        state: "missing",
        workflows: [] as string[],
        cron_labels: CRON_LABELS_BY_AGENT[key] ?? [],
        preferred_model_id: null,
        fallback_model_id: null,
        task_default: null,
        vision_enabled: false,
        catalog_model_valid: true,
        fallback_model_valid: true,
        spend_7d_usd: 0,
        missing_definition: true,
      };
    }
    const id = String(row.id);
    const preferred = (row.preferred_model_id as string | null) ?? null;
    const fallback = (row.fallback_model_id as string | null) ?? null;
    return {
      id,
      key,
      display_name: String(row.display_name ?? key),
      admin_role: row.admin_role as string,
      risk_ceiling: Number(row.risk_ceiling ?? 0),
      state: stateByAgent.get(id) ?? "disabled",
      workflows: (row.allowed_workflow_types as string[] | null) ?? [],
      cron_labels: CRON_LABELS_BY_AGENT[key] ?? [],
      preferred_model_id: preferred,
      fallback_model_id: fallback,
      task_default: (row.task_default as string | null) ?? null,
      vision_enabled: Boolean(row.vision_enabled),
      catalog_model_valid: catalogModelValid({
        environment: params.environment,
        modelId: preferred,
        enabledModelIds,
        evalByModelId,
      }),
      fallback_model_valid: catalogModelValid({
        environment: params.environment,
        modelId: fallback,
        enabledModelIds,
        evalByModelId,
      }),
      spend_7d_usd: Math.round((spend7dByAgent.get(id) ?? 0) * 1_000_000) / 1_000_000,
      missing_definition: false,
    };
  });

  const missingAgentKeys = agents.filter((a) => a.missing_definition).map((a) => a.key);

  return {
    module: {
      master_enabled: agentModule.masterEnabled,
      shadow_mode: agentModule.shadowMode,
      global_daily_spend_cap_usd: agentModule.globalDailySpendCapUsd,
      default_routing_policy_id: agentModule.defaultRoutingPolicyId,
    },
    emergency: {
      stop_new_runs: agentEmergency.stopNewRuns,
      stop_all_tool_calls: agentEmergency.stopAllToolCalls,
      block_approved_execution: agentEmergency.blockApprovedExecution,
      freeze_pending_proposals: agentEmergency.freezePendingProposals,
    },
    gate_status: {
      environment: params.environment,
      reads_allowed: agentModule.masterEnabled,
      mutations_allowed: mutationGate.allowed && !agentEmergency.blockApprovedExecution,
      blockers: mutationGate.blockers ?? [],
      gates,
      active_agents: agents.filter((a) => a.state === "active").length,
      pending_approvals: pendingRes.count ?? 0,
      missing_agent_keys: missingAgentKeys,
      checked_at: new Date().toISOString(),
    },
    agents,
    cron_schedules: AGENT_CRON_SCHEDULES.map((c) => ({ ...c })),
    spend: {
      platform_today_usd: Math.round(platformTodayUsd * 1_000_000) / 1_000_000,
      platform_month_usd: Math.round(platformMonthUsd * 1_000_000) / 1_000_000,
      agent_month_usd: Math.round(agentMonthUsd * 1_000_000) / 1_000_000,
      provider_ai_month_usd: Math.round(providerAiMonthUsd * 1_000_000) / 1_000_000,
      monthly_budget_usd: params.monthlyBudgetUsd,
      agent_daily_cap_usd: agentModule.globalDailySpendCapUsd,
    },
  };
}
