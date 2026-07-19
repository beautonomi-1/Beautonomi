/**
 * Bound tool registry — connects package-level tool contracts (@beautonomi/agent-tools)
 * to real service-role implementations in apps/web. Agents must only receive tools
 * from this registry; the raw package registry has placeholder executors that throw.
 */
import {
  supportReadTicketTool,
  opsReadSystemHealthTool,
  financeReadPayoutTool,
  trustReadFraudCaseTool,
  type AgentToolDefinition,
} from "@beautonomi/agent-tools";
import {
  readSupportTicket,
  readSystemHealth,
  readPayoutSummary,
  readFraudCaseBriefing,
} from "./implementations";

const boundSupportReadTicket: typeof supportReadTicketTool = {
  ...supportReadTicketTool,
  execute: (principal, input) => readSupportTicket(principal, input.ticketId),
};

const boundOpsReadSystemHealth: typeof opsReadSystemHealthTool = {
  ...opsReadSystemHealthTool,
  execute: (principal, input) => readSystemHealth(principal, input.environment),
};

const boundFinanceReadPayout: typeof financeReadPayoutTool = {
  ...financeReadPayoutTool,
  execute: (principal, input) => readPayoutSummary(principal, input.payoutId),
};

const boundTrustReadFraudCase: typeof trustReadFraudCaseTool = {
  ...trustReadFraudCaseTool,
  execute: (principal, input) => readFraudCaseBriefing(principal, input.caseId),
};

export const BOUND_TOOL_REGISTRY: ReadonlyArray<AgentToolDefinition<any, any>> = [
  boundSupportReadTicket,
  boundOpsReadSystemHealth,
  boundFinanceReadPayout,
  boundTrustReadFraudCase,
];

export function getBoundTool(name: string, version = "1") {
  return BOUND_TOOL_REGISTRY.find((t) => t.name === name && t.version === version);
}
