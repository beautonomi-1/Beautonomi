/**
 * Bound tool registry — connects package-level tool contracts (@beautonomi/agent-tools)
 * to real service-role implementations in apps/web. Agents must only receive tools
 * from this registry; the raw package registry has placeholder executors that throw.
 */
import {
  supportReadTicketTool,
  supportClassifyTicketTool,
  opsReadSystemHealthTool,
  financeReadPayoutTool,
  financeReadRefundTool,
  providerReadHealthSnapshotTool,
  trustReadFraudCaseTool,
  safetyReadContentReportTool,
  type AgentToolDefinition,
} from "@beautonomi/agent-tools";
import {
  readSupportTicket,
  classifySupportTicket,
  readSystemHealth,
  readPayoutSummary,
  readRefundSummary,
  readProviderHealthSnapshot,
  readFraudCaseBriefing,
  readContentReportSummary,
} from "./implementations";

const boundSupportReadTicket: typeof supportReadTicketTool = {
  ...supportReadTicketTool,
  execute: (principal, input) => readSupportTicket(principal, input.ticketId),
};

const boundSupportClassifyTicket: typeof supportClassifyTicketTool = {
  ...supportClassifyTicketTool,
  execute: (principal, input) => classifySupportTicket(principal, input),
};

const boundOpsReadSystemHealth: typeof opsReadSystemHealthTool = {
  ...opsReadSystemHealthTool,
  execute: (principal, input) => readSystemHealth(principal, input.environment),
};

const boundFinanceReadPayout: typeof financeReadPayoutTool = {
  ...financeReadPayoutTool,
  execute: (principal, input) => readPayoutSummary(principal, input.payoutId),
};

const boundFinanceReadRefund: typeof financeReadRefundTool = {
  ...financeReadRefundTool,
  execute: (principal, input) => readRefundSummary(principal, input.refundId),
};

const boundProviderReadHealthSnapshot: typeof providerReadHealthSnapshotTool = {
  ...providerReadHealthSnapshotTool,
  execute: (principal, input) => readProviderHealthSnapshot(principal, input.providerId),
};

const boundTrustReadFraudCase: typeof trustReadFraudCaseTool = {
  ...trustReadFraudCaseTool,
  execute: (principal, input) => readFraudCaseBriefing(principal, input.caseId),
};

const boundSafetyReadContentReport: typeof safetyReadContentReportTool = {
  ...safetyReadContentReportTool,
  execute: (principal, input) => readContentReportSummary(principal, input.reportId),
};

export const BOUND_TOOL_REGISTRY: ReadonlyArray<AgentToolDefinition<any, any>> = [
  boundSupportReadTicket,
  boundSupportClassifyTicket,
  boundOpsReadSystemHealth,
  boundFinanceReadPayout,
  boundFinanceReadRefund,
  boundProviderReadHealthSnapshot,
  boundTrustReadFraudCase,
  boundSafetyReadContentReport,
];

export function getBoundTool(name: string, version = "1") {
  return BOUND_TOOL_REGISTRY.find((t) => t.name === name && t.version === version);
}
