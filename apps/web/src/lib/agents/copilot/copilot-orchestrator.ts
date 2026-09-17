import type { AdminSection } from "@beautonomi/admin-access";
import { executeTool } from "@beautonomi/agent-tools";
import type { AuthzContext } from "@beautonomi/agent-policy";
import { redactPromptObject } from "@/lib/ai/redact-prompt-pii";
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
import { copilotInputSchema, type CopilotInput } from "./copilot-types";
import { inferIntent, resolveCopilotQuestion, type CopilotIntent } from "./resolve-copilot-intent";
import type { CopilotEntityType } from "./copilot-types";
import { appendReportDeepLinks, planToolsForIntent, type PlannedToolCall } from "./plan-copilot-tools";
import { runCopilotPropose } from "./copilot-propose";
import { buildAllowedToolsBrief, DEFAULT_SUGGESTED_PROMPTS } from "./copilot-capabilities";
import {
  buildCopilotHelpSystemPrompt,
  buildCopilotSynthesisSystemPrompt,
  formatToolsBriefForPrompt,
} from "./copilot-platform-prompt";
import {
  planCopilotTurn,
  shouldInvokePlanner,
  turnPlanToPlannedCalls,
} from "./copilot-planner";
import { bindEntityFromSearchQuery } from "./copilot-search-bind";
import { routeModel } from "@beautonomi/agent-model-router";
import { resolveAiRuntime } from "@/lib/ai/resolve-runtime";
import { randomUUID } from "crypto";

const MAX_TOOL_CALLS = 8;

type Finding = {
  statement: string;
  kind: string;
  evidence: Array<{ sourceToolCallId: string; toolName: string; observedAt: string }>;
};

function findingStatement(toolName: string, output: unknown, maxBytes: number): string {
  const redacted = redactPromptObject(output);
  const raw = JSON.stringify(redacted);
  const capped = raw.length > maxBytes ? `${raw.slice(0, maxBytes)}…` : raw;
  return `${toolName}: ${capped}`;
}

async function executePlannedTools(params: {
  planned: PlannedToolCall[];
  input: CopilotInput;
  def: { id: string; active_version: string };
  principal: ReturnType<typeof buildAgentPrincipal>;
  agentModule: Awaited<ReturnType<typeof loadAgentModuleConfig>>;
  emergency: Awaited<ReturnType<typeof loadAgentEmergencyControls>>;
  op: Awaited<ReturnType<typeof loadAgentOperationalState>>;
}): Promise<{ findings: Finding[]; deniedTools: string[]; toolCalls: number }> {
  const findings: Finding[] = [];
  const deniedTools: string[] = [];
  let toolCalls = 0;

  for (const plannedCall of params.planned) {
    if (toolCalls >= MAX_TOOL_CALLS) break;
    const tool = getBoundTool(plannedCall.name);
    if (!tool) continue;

    const sectionAllowed =
      params.input.allowedSections.length === 0 ||
      params.input.allowedSections.includes(tool.requiredSection);
    if (!sectionAllowed) {
      deniedTools.push(tool.name);
      continue;
    }

    const grant = await loadToolGrant(params.def.id, tool.name, tool.version);
    const ctx: AuthzContext = {
      principal: params.principal,
      module: params.agentModule,
      operational: params.op,
      emergency: params.emergency,
      toolGrant: grant,
      requiredSection: tool.requiredSection as AdminSection,
      resolvedRiskTier: tool.baseRiskTier,
    };
    const result = await executeTool(tool, ctx, plannedCall.input);
    toolCalls++;
    if (result.ok) {
      const maxOut = tool.maxOutputBytes ?? 8192;
      findings.push({
        statement: findingStatement(tool.name, result.output, maxOut),
        kind: "platform_fact",
        evidence: [
          {
            sourceToolCallId: result.toolCallId,
            toolName: tool.name,
            observedAt: new Date().toISOString(),
          },
        ],
      });
    } else if ((result as { policyDenied?: boolean }).policyDenied) {
      deniedTools.push(tool.name);
    }
  }

  return { findings, deniedTools, toolCalls };
}

async function synthesizeAnswer(params: {
  question: string;
  messages: CopilotInput["messages"];
  findings: Finding[];
  deniedTools: string[];
  preferredModel: string;
  fallbackModelId: string | null;
  maxCostUsd: number;
  spentUsd: number;
  agentId: string;
  tenantId: string;
}): Promise<{ answer: string; modelUsed: string; spentUsd: number }> {
  let answer =
    params.findings.length > 0
      ? `Based on ${params.findings.length} authorized read(s), here is what I found for: ${params.question}`
      : `I could not retrieve authorized data for: ${params.question}. No unsupported claims were made.`;
  if (params.deniedTools.length > 0 && params.findings.length === 0) {
    answer += ` Some tools were unavailable for your role (${params.deniedTools.join(", ")}).`;
  }

  let modelUsed = params.preferredModel;
  let spentUsd = params.spentUsd;

  const shouldCallLlm = params.findings.length > 0 || params.deniedTools.length > 0;
  if (!shouldCallLlm) {
    return { answer, modelUsed, spentUsd };
  }

  try {
    const llm = await callAgentLlm({
      system: buildCopilotSynthesisSystemPrompt(),
      user: JSON.stringify({
        question: params.question,
        messages: params.messages ?? [],
        findings: params.findings.map((f) => f.statement),
        denied_tools: params.deniedTools,
      }),
      maxTokens: 700,
      modelId: params.preferredModel,
      fallbackModelId: params.fallbackModelId,
      task: "copilot",
      agentId: params.agentId,
      tenantId: params.tenantId,
      maxCostUsd: params.maxCostUsd,
      spentUsd,
      featureKey: "agent.admin-copilot",
      promptVersion: "copilot-synth:v1",
    });
    if (llm.configured && llm.success === true) {
      answer = llm.text.trim();
      modelUsed = llm.model;
      spentUsd += llm.costUsd;
    }
  } catch {
    // keep deterministic fallback
  }

  return { answer, modelUsed, spentUsd };
}

async function answerHelpTurn(params: {
  input: CopilotInput;
  toolsBrief: ReturnType<typeof buildAllowedToolsBrief>;
  preferredModel: string;
  fallbackModelId: string | null;
  maxCostUsd: number;
  agentId: string;
}): Promise<{ answer: string; modelUsed: string; suggestedPrompts: string[] }> {
  const fallback = [
    "I'm your Beautonomi admin copilot. I can look up providers, customers, and bookings (try a name, email, phone, or BTN- ref), summarize records using read-only platform data, and draft support or provider messages for your review.",
    "",
    "What I can use depends on your admin role sections:",
    formatToolsBriefForPrompt(params.toolsBrief),
    "",
    "Gift cards and per-user memberships aren't available through copilot yet.",
  ].join("\n");

  try {
    const llm = await callAgentLlm({
      system: buildCopilotHelpSystemPrompt(),
      user: JSON.stringify({
        question: params.input.question,
        messages: params.input.messages ?? [],
        allowed_sections: params.input.allowedSections,
        allowed_tools: params.toolsBrief,
      }),
      maxTokens: 550,
      modelId: params.preferredModel,
      fallbackModelId: params.fallbackModelId,
      task: "copilot",
      agentId: params.agentId,
      tenantId: params.input.tenantId,
      maxCostUsd: params.maxCostUsd,
      spentUsd: 0,
      featureKey: "agent.admin-copilot",
      promptVersion: "copilot-help:v1",
    });
    if (llm.configured && llm.success === true && llm.text.trim()) {
      return {
        answer: llm.text.trim(),
        modelUsed: llm.model,
        suggestedPrompts: DEFAULT_SUGGESTED_PROMPTS,
      };
    }
  } catch {
    // fallback text
  }

  return {
    answer: fallback,
    modelUsed: params.preferredModel,
    suggestedPrompts: DEFAULT_SUGGESTED_PROMPTS,
  };
}

async function draftTextsForPropose(params: {
  question: string;
  findings: Finding[];
  preferredModel: string;
  fallbackModelId: string | null;
  maxCostUsd: number;
  spentUsd: number;
  agentId: string;
  tenantId: string;
}): Promise<{ draftReply?: string; draftProvider?: string; spentUsd: number }> {
  if (!params.findings.length) return { spentUsd: params.spentUsd };

  try {
    const llm = await callAgentLlm({
      system: [
        "Draft admin-facing message text for human review only. Use ONLY facts from findings.",
        "Return plain text for the draft body — no JSON.",
        "If support reply, write a professional draft reply to the customer.",
        "If provider outreach/digest, write a short professional nudge.",
      ].join("\n"),
      user: JSON.stringify({
        question: params.question,
        findings: params.findings.map((f) => f.statement),
      }),
      maxTokens: 500,
      modelId: params.preferredModel,
      fallbackModelId: params.fallbackModelId,
      task: "copilot",
      agentId: params.agentId,
      tenantId: params.tenantId,
      maxCostUsd: params.maxCostUsd,
      spentUsd: params.spentUsd,
      featureKey: "agent.admin-copilot",
      promptVersion: "copilot-draft:v1",
    });
    if (llm.configured && llm.success === true && llm.text.trim()) {
      const text = llm.text.trim();
      const isReply = /\breply\b/i.test(params.question);
      return {
        draftReply: isReply ? text : undefined,
        draftProvider: !isReply ? text : undefined,
        spentUsd: params.spentUsd + llm.costUsd,
      };
    }
  } catch {
    // stubs in propose
  }
  return { spentUsd: params.spentUsd };
}

function baseResponseShell(conversationId: string, preferredModel: string) {
  return {
    conversationId,
    findings: [] as Finding[],
    deniedTools: [] as string[],
    modelUsed: preferredModel,
    toolCalls: 0,
    limits: { maxToolCalls: MAX_TOOL_CALLS, maxRecords: 50 },
    citationsRequired: true,
  };
}

export async function runAdminCopilotOrchestrator(raw: unknown) {
  const input = copilotInputSchema.parse(raw);
  const agentModule = await loadAgentModuleConfig();
  const gate = assertAgentReadAllowed({ masterEnabled: agentModule.masterEnabled });
  if (!gate.allowed) return { error: gate.reason, blockers: gate.blockers };

  const def = await loadAgentDefinition("admin-copilot");
  if (!def) return { error: "copilot_not_configured" };

  const conversationId = input.conversationId ?? randomUUID();
  const toolsBrief = buildAllowedToolsBrief(input.allowedSections);

  const principal = buildAgentPrincipal({
    actorId: input.adminUserId,
    agentKey: "admin-copilot",
    agentDefinitionVersion: def.active_version,
    tenantId: input.tenantId,
    role: input.adminRole,
    workflowType: "admin-copilot",
    workflowRunId: `copilot-${conversationId}`,
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
  const fallbackModelId = (def as { fallback_model_id?: string | null }).fallback_model_id ?? null;

  const emergency = await loadAgentEmergencyControls();
  const op = await loadAgentOperationalState("admin-copilot");

  let resolved = await resolveCopilotQuestion(input);
  let spentUsd = 0;
  let modelUsed = preferredModel;

  if (resolved.status === "help") {
    const help = await answerHelpTurn({
      input,
      toolsBrief,
      preferredModel,
      fallbackModelId,
      maxCostUsd,
      agentId: def.id,
    });
    return {
      ...baseResponseShell(conversationId, help.modelUsed),
      answer: help.answer,
      resolvedEntities: resolved.resolvedEntities,
      suggestedPrompts: help.suggestedPrompts,
    };
  }

  if (resolved.status === "disambiguation") {
    return {
      ...baseResponseShell(conversationId, preferredModel),
      answer: resolved.prompt,
      disambiguation: { prompt: resolved.prompt, options: resolved.options },
      resolvedEntities: resolved.resolvedEntities,
    };
  }

  if (resolved.status === "clarify") {
    return {
      ...baseResponseShell(conversationId, preferredModel),
      answer: resolved.message,
      resolvedEntities: resolved.resolvedEntities,
      suggestedPrompts: resolved.suggestedPrompts,
    };
  }

  if (resolved.status === "not_found") {
    return {
      ...baseResponseShell(conversationId, preferredModel),
      answer: resolved.message,
      resolvedEntities: resolved.resolvedEntities,
      suggestedPrompts: DEFAULT_SUGGESTED_PROMPTS,
    };
  }

  let intent: CopilotIntent = resolved.intent;
  let resolvedEntities = resolved.resolvedEntities;
  const hasPrimary = Boolean(
    resolvedEntities.provider ||
      resolvedEntities.user ||
      resolvedEntities.booking ||
      resolvedEntities.ticket,
  );

  let planned: PlannedToolCall[] = [];

  if (
    shouldInvokePlanner({
      intent,
      hasPrimary,
      resolverStatus: "ready",
    })
  ) {
    const planResult = await planCopilotTurn({
      input: { ...input, resolvedEntities },
      toolsBrief,
      preferredModel,
      fallbackModelId,
      maxCostUsd,
      spentUsd,
      agentId: def.id,
    });

    if (planResult.ok) {
      spentUsd = planResult.spentUsd;
      if (planResult.modelUsed) modelUsed = planResult.modelUsed;
      const plan = planResult.plan;

      if (plan.turn_kind === "help") {
        const help = await answerHelpTurn({
          input,
          toolsBrief,
          preferredModel,
          fallbackModelId,
          maxCostUsd,
          agentId: def.id,
        });
        return {
          ...baseResponseShell(conversationId, help.modelUsed),
          answer: help.answer,
          resolvedEntities,
          suggestedPrompts: help.suggestedPrompts,
        };
      }

      if (plan.turn_kind === "clarify" && plan.clarify_message) {
        return {
          ...baseResponseShell(conversationId, modelUsed),
          answer: plan.clarify_message,
          resolvedEntities,
          suggestedPrompts: DEFAULT_SUGGESTED_PROMPTS,
        };
      }

      if (plan.turn_kind === "lookup" && plan.search_query) {
        const bind = await bindEntityFromSearchQuery({
          tenantId: input.tenantId,
          query: plan.search_query,
          resolvedEntities,
        });
        if (bind.status === "disambiguation") {
          return {
            ...baseResponseShell(conversationId, modelUsed),
            answer: bind.prompt,
            disambiguation: { prompt: bind.prompt, options: bind.options },
            resolvedEntities: bind.resolvedEntities,
          };
        }
        if (bind.status === "clarify") {
          return {
            ...baseResponseShell(conversationId, modelUsed),
            answer: bind.message,
            resolvedEntities: bind.resolvedEntities,
            suggestedPrompts: bind.suggestedPrompts,
          };
        }
        if (bind.status === "not_found") {
          return {
            ...baseResponseShell(conversationId, modelUsed),
            answer: bind.message,
            resolvedEntities: bind.resolvedEntities,
            suggestedPrompts: DEFAULT_SUGGESTED_PROMPTS,
          };
        }
        resolvedEntities = bind.resolvedEntities;
        const primaryAfter =
          resolvedEntities.provider ??
          resolvedEntities.user ??
          resolvedEntities.booking ??
          resolvedEntities.ticket;
        if (primaryAfter) {
          intent = inferIntent(input.question, primaryAfter.entityType as CopilotEntityType);
        }
      }

      planned = turnPlanToPlannedCalls(plan);
    }
  }

  if (!planned.length) {
    planned = await planToolsForIntent({
      intent,
      question: input.question,
      environment: agentModule.environment,
      allowedSections: input.allowedSections,
      tenantId: input.tenantId,
      resolvedEntities,
    });
  }

  const toolOut = await executePlannedTools({
    planned,
    input,
    def,
    principal,
    agentModule,
    emergency,
    op,
  });

  const wantPropose =
    /\b(draft|propose|write|prepare)\b.*\b(reply|nudge|outreach|digest|message|email)\b/i.test(
      input.question,
    );

  let draftReplyText: string | undefined;
  let draftProviderText: string | undefined;
  if (wantPropose && toolOut.findings.length > 0) {
    const drafts = await draftTextsForPropose({
      question: input.question,
      findings: toolOut.findings,
      preferredModel,
      fallbackModelId,
      maxCostUsd,
      spentUsd,
      agentId: def.id,
      tenantId: input.tenantId,
    });
    spentUsd = drafts.spentUsd;
    draftReplyText = drafts.draftReply;
    draftProviderText = drafts.draftProvider;
  }

  const proposeResult = await runCopilotPropose({
    question: input.question,
    intent,
    resolvedEntities,
    tenantId: input.tenantId,
    adminUserId: input.adminUserId,
    adminRole: input.adminRole,
    conversationId,
    agentDefinitionId: def.id,
    policyVersion: def.active_version,
    draftReplyText,
    draftProviderText,
  });

  const synth = await synthesizeAnswer({
    question: input.question,
    messages: input.messages,
    findings: toolOut.findings,
    deniedTools: toolOut.deniedTools,
    preferredModel,
    fallbackModelId,
    maxCostUsd,
    spentUsd,
    agentId: def.id,
    tenantId: input.tenantId,
  });
  spentUsd = synth.spentUsd;
  modelUsed = synth.modelUsed;

  let answer = synth.answer;
  answer += appendReportDeepLinks(intent, resolvedEntities);
  if (proposeResult) {
    answer += `\n\n${proposeResult.message}`;
  }

  return {
    conversationId,
    answer,
    findings: toolOut.findings,
    deniedTools: toolOut.deniedTools,
    modelUsed,
    toolCalls: toolOut.toolCalls,
    resolvedEntities,
    proposedAction: proposeResult?.proposedAction,
    limits: { maxToolCalls: MAX_TOOL_CALLS, maxRecords: 50 },
    citationsRequired: true,
    suggestedPrompts: toolOut.findings.length === 0 ? DEFAULT_SUGGESTED_PROMPTS : undefined,
  };
}
