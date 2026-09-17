import { callAgentLlm, parseLlmJson } from "../llm";
import type { CopilotInput } from "./copilot-types";
import {
  buildAllowedToolsBrief,
  filterPlannerToolNames,
  type CopilotToolBriefLine,
} from "./copilot-capabilities";
import {
  buildCopilotPlannerSystemPrompt,
  formatToolsBriefForPrompt,
} from "./copilot-platform-prompt";
import type { PlannedToolCall } from "./plan-copilot-tools";

export type CopilotTurnKind = "help" | "lookup" | "data_question" | "propose_draft" | "clarify";

export type CopilotTurnPlan = {
  turn_kind: CopilotTurnKind;
  search_query?: string | null;
  tool_calls?: Array<{ name: string; input: Record<string, unknown> }>;
  clarify_message?: string | null;
};

export const COPILOT_TURN_PLAN_SCHEMA = {
  type: "object",
  properties: {
    turn_kind: {
      type: "string",
      enum: ["help", "lookup", "data_question", "propose_draft", "clarify"],
    },
    search_query: { type: ["string", "null"] },
    tool_calls: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          input: { type: "object" },
        },
        required: ["name", "input"],
      },
    },
    clarify_message: { type: ["string", "null"] },
  },
  required: ["turn_kind"],
};

export type PlanCopilotTurnResult =
  | { ok: true; plan: CopilotTurnPlan; spentUsd: number; modelUsed?: string }
  | { ok: false; reason: string };

export function sanitizeTurnPlan(
  raw: CopilotTurnPlan | null,
  allowedSections: string[],
): CopilotTurnPlan | null {
  if (!raw?.turn_kind) return null;
  const allowed = filterPlannerToolNames(allowedSections);
  const tool_calls = (raw.tool_calls ?? [])
    .filter((c) => allowed.has(c.name))
    .slice(0, 4)
    .map((c) => ({ name: c.name, input: c.input ?? {} }));
  return {
    turn_kind: raw.turn_kind,
    search_query: typeof raw.search_query === "string" ? raw.search_query.trim() || null : null,
    tool_calls,
    clarify_message:
      typeof raw.clarify_message === "string" ? raw.clarify_message.trim() || null : null,
  };
}

export function turnPlanToPlannedCalls(plan: CopilotTurnPlan): PlannedToolCall[] {
  return (plan.tool_calls ?? []).map((c) => ({ name: c.name, input: c.input }));
}

export async function planCopilotTurn(params: {
  input: CopilotInput;
  toolsBrief: CopilotToolBriefLine[];
  preferredModel: string;
  fallbackModelId: string | null;
  maxCostUsd: number;
  spentUsd: number;
  agentId: string;
}): Promise<PlanCopilotTurnResult> {
  const { input, toolsBrief, preferredModel, fallbackModelId, maxCostUsd, spentUsd, agentId } = params;

  const llm = await callAgentLlm({
    system: buildCopilotPlannerSystemPrompt(),
    user: JSON.stringify({
      question: input.question,
      messages: input.messages ?? [],
      resolvedEntities: input.resolvedEntities ?? {},
      pageContext: input.pageContext ?? null,
      allowed_sections: input.allowedSections,
      allowed_tools: toolsBrief,
      allowed_tools_text: formatToolsBriefForPrompt(toolsBrief),
    }),
    schema: COPILOT_TURN_PLAN_SCHEMA,
    maxTokens: 600,
    modelId: preferredModel,
    fallbackModelId,
    task: "copilot",
    agentId,
    tenantId: input.tenantId,
    maxCostUsd,
    spentUsd,
    featureKey: "agent.admin-copilot",
    promptVersion: "copilot-plan:v1",
  });

  if (!llm.configured) return { ok: false, reason: "llm_not_configured" };
  if (llm.success !== true) return { ok: false, reason: llm.errorCode ?? "llm_failed" };

  const parsed = parseLlmJson<CopilotTurnPlan>(llm.text);
  const plan = sanitizeTurnPlan(parsed, input.allowedSections);
  if (!plan) return { ok: false, reason: "invalid_plan_json" };

  return { ok: true, plan, spentUsd: spentUsd + llm.costUsd, modelUsed: llm.model };
}

export function shouldInvokePlanner(params: {
  intent: string;
  hasPrimary: boolean;
  resolverStatus: string;
}): boolean {
  if (params.resolverStatus === "help" || params.resolverStatus === "disambiguation") return false;
  if (params.intent === "unknown") return true;
  if (!params.hasPrimary) return true;
  return false;
}
