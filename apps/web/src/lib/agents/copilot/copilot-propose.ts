import { hashPayload } from "@beautonomi/agent-policy";
import { proposeAgentAction } from "../actions/action-service";
import { agentActionDeepLink } from "../actions/present-action";
import type { CopilotIntent } from "./resolve-copilot-intent";
import type { CopilotResolvedEntities } from "./copilot-types";

const PROPOSE_PATTERNS =
  /\b(draft|propose|write|prepare)\b.*\b(reply|nudge|outreach|digest|message|email)\b/i;

export async function runCopilotPropose(params: {
  question: string;
  intent: CopilotIntent;
  resolvedEntities: CopilotResolvedEntities;
  tenantId: string;
  adminUserId: string;
  adminRole: string;
  conversationId: string;
  agentDefinitionId: string;
  policyVersion: string;
  draftReplyText?: string;
  draftProviderText?: string;
}): Promise<{ message: string; proposedAction?: { actionId: string; actionType: string; assistDeepLink: string } } | null> {
  if (!PROPOSE_PATTERNS.test(params.question)) return null;

  const ticket = params.resolvedEntities.ticket;
  const provider = params.resolvedEntities.provider;

  try {
    if (ticket && /\breply\b/i.test(params.question)) {
      const proposedPayload = {
        ticketId: ticket.entityId,
        draftReply:
          params.draftReplyText?.trim() || "Draft reply — review and edit before sending.",
        source: "admin-copilot",
      };
      const action = await proposeAgentAction({
        tenantId: params.tenantId,
        agentId: params.agentDefinitionId,
        workflowRunId: `copilot-${params.conversationId}`,
        actionType: "support.reply",
        targetType: "support_ticket",
        targetId: ticket.entityId,
        proposedPayload,
        reasoningSummary: "Copilot drafted a support reply for human review.",
        riskLevel: 1,
        policyVersion: params.policyVersion,
        toolName: "copilot.propose",
        idempotencyKey: `copilot-reply:${ticket.entityId}:${hashPayload(proposedPayload).slice(0, 16)}`,
      });
      if (!action) return null;
      return {
        message: "I drafted a support reply for your review.",
        proposedAction: {
          actionId: action.id,
          actionType: action.action_type,
          assistDeepLink: agentActionDeepLink(
            "support.reply",
            "support_ticket",
            ticket.entityId,
            action.id,
          ),
        },
      };
    }

    if (provider && /\b(nudge|outreach|digest)\b/i.test(params.question)) {
      const actionType = /\bdigest\b/i.test(params.question) ? "provider.digest" : "provider.outreach";
      const proposedPayload = {
        providerId: provider.entityId,
        draft: params.draftProviderText?.trim() || "Draft message — review before sending.",
        source: "admin-copilot",
      };
      const action = await proposeAgentAction({
        tenantId: params.tenantId,
        agentId: params.agentDefinitionId,
        workflowRunId: `copilot-${params.conversationId}`,
        actionType,
        targetType: "provider",
        targetId: provider.entityId,
        proposedPayload,
        reasoningSummary: "Copilot drafted a provider message for human review.",
        riskLevel: 1,
        policyVersion: params.policyVersion,
        toolName: "copilot.propose",
        idempotencyKey: `copilot-${actionType}:${provider.entityId}:${hashPayload(proposedPayload).slice(0, 16)}`,
      });
      if (!action) return null;
      return {
        message: "I drafted a provider message for your review.",
        proposedAction: {
          actionId: action.id,
          actionType: action.action_type,
          assistDeepLink: agentActionDeepLink(actionType, "provider", provider.entityId, action.id),
        },
      };
    }
  } catch {
    return null;
  }

  return null;
}
