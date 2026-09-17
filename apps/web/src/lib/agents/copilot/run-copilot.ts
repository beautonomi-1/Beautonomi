import { randomUUID } from "crypto";
import type { AdminSection } from "@beautonomi/admin-access";
import { routeModel } from "@beautonomi/agent-model-router";
import { resolveAiRuntime } from "@/lib/ai/resolve-runtime";
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
import { copilotInputSchema } from "./copilot-types";
import { resolveCopilotQuestion } from "./resolve-copilot-intent";
import { appendReportDeepLinks, planToolsForIntent } from "./plan-copilot-tools";
import { runCopilotPropose } from "./copilot-propose";

const MAX_TOOL_CALLS = 8;
const MAX_RECORDS = 50;

export async function runAdminCopilot(raw: unknown) {
  const input = copilotInputSchema.parse(raw);
  const agentModule = await loadAgentModuleConfig();
  const gate = assertAgentReadAllowed({ masterEnabled: agentModule.masterEnabled });
  if (!gate.allowed) return { error: gate.reason, blockers: gate.blockers };

  const def = await loadAgentDefinition("admin-copilot");
  if (!def) return { error: "copilot_not_configured" };

  const conversationId = input.conversationId ?? randomUUID();
  const workflowRunId = `copilot-${conversationId}`;

  const principal = buildAgentPrincipal({
    actorId: input.adminUserId,
    agentKey: "admin-copilot",
    agentDefinitionVersion: def.active_version,
    tenantId: input.tenantId,
    role: input.adminRole,
    workflowType: "admin-copilot",
    workflowRunId,
  });

  const runtime = await resolveAiRuntime(agentModule.environment, input.tenantId);
  const maxCostUsd = Number((def as { max_cost_usd_per_run?: number | null }).max_cost_usd_per_run ?? 0.1);
  const route = routeModel({
    task: "copilot",
    riskTier: 0,
    contextTokens: 4000,
    escalationSignals: [],
    escalationCount: 0,
    maxEscalations: 2,
    maxCostUsd,
    spentUsd: 0,
    catalog: runtime.catalog,
  });
  const preferredModel =
    (def as { preferred_model_id?: string | null }).preferred_model_id ?? route.modelId;

  const emergency = await loadAgentEmergencyControls();
  const op = await loadAgentOperationalState("admin-copilot");

  const resolved = await resolveCopilotQuestion(input);

  if (resolved.status === "disambiguation") {
    return {
      conversationId,
      answer: resolved.prompt,
      disambiguation: { prompt: resolved.prompt, options: resolved.options },
      resolvedEntities: resolved.resolvedEntities,
      findings: [],
      deniedTools: [],
      modelUsed: preferredModel,
      toolCalls: 0,
      limits: { maxToolCalls: MAX_TOOL_CALLS, maxRecords: MAX_RECORDS },
      citationsRequired: true,
    };
  }

  if (resolved.status === "not_found") {
    return {
      conversationId,
      answer: resolved.message,
      resolvedEntities: resolved.resolvedEntities,
      findings: [],
      deniedTools: [],
      modelUsed: preferredModel,
      toolCalls: 0,
      limits: { maxToolCalls: MAX_TOOL_CALLS, maxRecords: MAX_RECORDS },
      citationsRequired: true,
    };
  }

  const proposeResult = await runCopilotPropose({
    question: input.question,
    intent: resolved.intent,
    resolvedEntities: resolved.resolvedEntities,
    tenantId: input.tenantId,
    adminUserId: input.adminUserId,
    adminRole: input.adminRole,
    conversationId,
    agentDefinitionId: def.id,
    policyVersion: def.active_version,
  });

  const planned = await planToolsForIntent({
    intent: resolved.intent,
    question: input.question,
    environment: agentModule.environment,
    allowedSections: input.allowedSections,
    tenantId: input.tenantId,
    resolvedEntities: resolved.resolvedEntities,
  });

  const findings: Array<{
    statement: string;
    kind: string;
    evidence: Array<{ sourceToolCallId: string; toolName: string; observedAt: string }>;
  }> = [];
  const deniedTools: string[] = [];
  let toolCalls = 0;

  for (const plannedCall of planned) {
    if (toolCalls >= MAX_TOOL_CALLS) break;
    const tool = getBoundTool(plannedCall.name);
    if (!tool) continue;

    const sectionAllowed =
      input.allowedSections.length === 0 || input.allowedSections.includes(tool.requiredSection);
    if (!sectionAllowed) {
      deniedTools.push(tool.name);
      continue;
    }

    const grant = await loadToolGrant(def.id, tool.name, tool.version);
    const ctx: AuthzContext = {
      principal,
      module: agentModule,
      operational: op,
      emergency,
      toolGrant: grant,
      requiredSection: tool.requiredSection as AdminSection,
      resolvedRiskTier: tool.baseRiskTier,
    };
    const result = await executeTool(tool, ctx, plannedCall.input);
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

  let answer =
    findings.length > 0
      ? `Based on ${findings.length} authorized read-only tool result(s) (${toolCalls} calls), here is what I found for: ${input.question}`
      : `I could not retrieve authorized data for: ${input.question}. No unsupported claims were made.`;
  if (deniedTools.length > 0 && findings.length === 0) {
    answer += ` Some tools were unavailable for your role (${deniedTools.join(", ")}).`;
  }
  let modelUsed = preferredModel;

  if (findings.length > 0) {
    try {
      const llm = await callAgentLlm({
        system: [
          "You are the Beautonomi admin copilot. Answer the admin's question using ONLY the tool findings provided.",
          "Rules: never invent data not present in the findings; if the findings do not answer the question, say so.",
          "Be concise (max ~150 words), factual, and reference which tool each fact came from.",
          "If finance data is missing due to access, suggest opening the Finance tab — do not invent dollar amounts.",
          "Gift cards and per-user memberships are not available via copilot; say so if asked.",
        ].join("\n"),
        user: JSON.stringify({ question: input.question, findings: findings.map((f) => f.statement) }),
        maxTokens: 500,
        modelId: preferredModel,
        fallbackModelId: (def as { fallback_model_id?: string | null }).fallback_model_id ?? null,
        task: "copilot",
        agentId: def.id,
        tenantId: input.tenantId,
        maxCostUsd,
        featureKey: "agent.admin-copilot",
      });
      if (llm.configured && llm.success === true) {
        answer = llm.text.trim();
        modelUsed = llm.model;
      }
    } catch {
      // Deterministic fallback answer already set.
    }
  }

  answer += appendReportDeepLinks(resolved.intent, resolved.resolvedEntities);

  if (proposeResult) {
    answer += `\n\n${proposeResult.message}`;
  }

  return {
    conversationId,
    answer,
    findings,
    deniedTools,
    modelUsed,
    toolCalls,
    resolvedEntities: resolved.resolvedEntities,
    proposedAction: proposeResult?.proposedAction,
    limits: { maxToolCalls: MAX_TOOL_CALLS, maxRecords: MAX_RECORDS },
    citationsRequired: true,
  };
}
