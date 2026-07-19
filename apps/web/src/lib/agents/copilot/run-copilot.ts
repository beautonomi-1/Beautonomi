import { z } from "zod";
import type { AdminSection } from "@beautonomi/admin-access";
import { canAccessSection } from "@beautonomi/admin-access";
import { routeModel } from "@beautonomi/agent-model-router";
import { executeTool } from "@beautonomi/agent-tools";
import type { AuthzContext } from "@beautonomi/agent-policy";
import {
  loadAgentDefinition,
  loadAgentEmergencyControls,
  loadAgentModuleConfig,
  loadAgentOperationalState,
  loadToolGrant,
} from "../config-loader";
import { assertAgentReadAllowed } from "../safety-gate";
import { buildAgentPrincipal } from "../principal";
import { getBoundTool } from "../tools/bound-registry";
import { callAgentLlm } from "../llm";

const MAX_TOOL_CALLS = 8;
const MAX_RECORDS = 50;

const copilotInputSchema = z.object({
  question: z.string().min(1).max(2000),
  tenantId: z.string().uuid(),
  adminRole: z.string(),
  adminUserId: z.string().uuid(),
  allowedSections: z.array(z.string()),
});

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** Plan which read-only tools can answer the question without inventing identifiers. */
function planToolCalls(question: string, environment: string): Array<{ name: string; input: unknown }> {
  const calls: Array<{ name: string; input: unknown }> = [
    { name: "ops.readSystemHealth", input: { environment } },
  ];
  const referencedId = UUID_RE.exec(question)?.[0];
  if (referencedId) {
    const q = question.toLowerCase();
    if (q.includes("ticket")) calls.push({ name: "support.readTicket", input: { ticketId: referencedId } });
    if (q.includes("payout")) calls.push({ name: "finance.readPayout", input: { payoutId: referencedId } });
    if (q.includes("fraud")) calls.push({ name: "trust.readFraudCase", input: { caseId: referencedId } });
  }
  return calls;
}

export async function runAdminCopilot(raw: unknown) {
  const input = copilotInputSchema.parse(raw);
  const module = await loadAgentModuleConfig();
  const gate = assertAgentReadAllowed({ masterEnabled: module.masterEnabled });
  if (!gate.allowed) return { error: gate.reason, blockers: gate.blockers };

  const def = await loadAgentDefinition("admin-copilot");
  if (!def) return { error: "copilot_not_configured" };

  const principal = buildAgentPrincipal({
    actorId: input.adminUserId,
    agentKey: "admin-copilot",
    agentDefinitionVersion: def.active_version,
    tenantId: input.tenantId,
    role: input.adminRole,
    workflowType: "admin-copilot",
    workflowRunId: `copilot-${Date.now()}`,
  });

  const route = routeModel({
    task: "copilot",
    riskTier: 0,
    contextTokens: 4000,
    escalationSignals: [],
    escalationCount: 0,
    maxEscalations: 2,
    maxCostUsd: 0.1,
    spentUsd: 0,
  });

  const emergency = await loadAgentEmergencyControls();
  const op = await loadAgentOperationalState("admin-copilot");

  const findings: Array<{
    statement: string;
    kind: string;
    evidence: Array<{ sourceToolCallId: string; toolName: string; observedAt: string }>;
  }> = [];
  const deniedTools: string[] = [];
  let toolCalls = 0;

  for (const planned of planToolCalls(input.question, module.environment)) {
    if (toolCalls >= MAX_TOOL_CALLS) break;
    const tool = getBoundTool(planned.name);
    if (!tool) continue;
    if (!canAccessSection(input.adminRole as never, tool.requiredSection)) {
      deniedTools.push(tool.name);
      continue;
    }

    const grant = await loadToolGrant(def.id, tool.name, tool.version);
    const ctx: AuthzContext = {
      principal,
      module,
      operational: op,
      emergency,
      toolGrant: grant,
      requiredSection: tool.requiredSection as AdminSection,
      resolvedRiskTier: tool.baseRiskTier,
    };
    const result = await executeTool(tool, ctx, planned.input);
    toolCalls++;
    if (result.ok) {
      findings.push({
        statement: `${tool.name}: ${JSON.stringify(result.output).slice(0, 500)}`,
        kind: "platform_fact",
        evidence: [
          { sourceToolCallId: result.toolCallId, toolName: tool.name, observedAt: new Date().toISOString() },
        ],
      });
    } else if ((result as { policyDenied?: boolean }).policyDenied) {
      deniedTools.push(tool.name);
    }
  }

  // Synthesize a grounded natural-language answer when the platform LLM is
  // configured; the deterministic summary below remains the fallback. The
  // model only ever sees tool outputs the admin was already authorized to read.
  let answer =
    findings.length > 0
      ? `Based on ${findings.length} authorized read-only tool result(s) (${toolCalls} calls), here is what I found for: ${input.question}`
      : `I could not retrieve authorized data for: ${input.question}. No unsupported claims were made.`;
  let modelUsed = route.modelId;

  if (findings.length > 0) {
    try {
      const llm = await callAgentLlm({
        system: [
          "You are the Beautonomi admin copilot. Answer the admin's question using ONLY the tool findings provided.",
          "Rules: never invent data not present in the findings; if the findings do not answer the question, say so.",
          "Be concise (max ~150 words), factual, and reference which tool each fact came from.",
        ].join("\n"),
        user: JSON.stringify({ question: input.question, findings: findings.map((f) => f.statement) }),
        maxTokens: 500,
      });
      if (llm.configured && llm.success === true) {
        answer = llm.text.trim();
        modelUsed = llm.model;
      }
    } catch {
      // Deterministic fallback answer already set.
    }
  }

  return {
    answer,
    findings,
    deniedTools,
    modelUsed,
    toolCalls,
    limits: { maxToolCalls: MAX_TOOL_CALLS, maxRecords: MAX_RECORDS },
    citationsRequired: true,
  };
}
