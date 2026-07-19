import { randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { routeModel } from "@beautonomi/agent-model-router";
import { buildAgentPrincipal } from "../principal";
import {
  loadAgentDefinition,
  loadAgentModuleConfig,
  loadAgentOperationalState,
} from "../config-loader";
import { assertAgentReadAllowed } from "../safety-gate";
import { readSystemHealth } from "../tools/implementations";

export async function runOpsSentinelWorkflow(params: { tenantId: string; environment: string }) {
  const module = await loadAgentModuleConfig(params.environment);
  const gate = assertAgentReadAllowed({ masterEnabled: module.masterEnabled });
  if (!gate.allowed) return { skipped: true, reason: gate.reason };

  const def = await loadAgentDefinition("ops-sentinel");
  if (!def) throw new Error("ops-sentinel not configured");
  const op = await loadAgentOperationalState("ops-sentinel");
  if (op.state !== "active") return { skipped: true, reason: "agent_not_active" };

  const runId = randomUUID();
  const principal = buildAgentPrincipal({
    actorId: def.id,
    agentKey: "ops-sentinel",
    agentDefinitionVersion: def.active_version,
    tenantId: params.tenantId,
    role: def.admin_role,
    workflowType: "ops-sentinel",
    workflowRunId: runId,
  });

  const supabase = getSupabaseAdmin();
  await supabase.from("agent_runs").insert({
    id: runId,
    tenant_id: params.tenantId,
    agent_id: def.id,
    agent_version: def.active_version,
    workflow_type: "ops-sentinel",
    workflow_run_id: runId,
    trigger_kind: "cron",
    status: "running",
    shadow_mode: module.shadowMode,
  });

  const health = await readSystemHealth(principal, params.environment);
  const route = routeModel({
    task: "summarization",
    riskTier: 0,
    contextTokens: 500,
    escalationSignals: health.status === "down" ? ["tool_call_failure"] : [],
    escalationCount: 0,
    maxEscalations: 2,
    maxCostUsd: 0.05,
    spentUsd: 0,
  });

  const summary = {
    status: health.status,
    checks: health.checks,
    modelUsed: route.modelId,
    shadowMode: module.shadowMode,
    findings: health.checks.filter((c) => !c.ok).map((c) => ({
      statement: `Check ${c.name} failed`,
      kind: "platform_fact" as const,
      evidence: [],
    })),
  };

  await supabase
    .from("agent_runs")
    .update({ status: "completed", ended_at: new Date().toISOString() })
    .eq("id", runId);

  return { runId, summary, shadowMode: module.shadowMode };
}
