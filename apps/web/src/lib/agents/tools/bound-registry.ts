/**
 * Bound tool registry — connects package-level tool contracts (@beautonomi/agent-tools)
 * to real service-role implementations in apps/web.
 */
import { getTool, type AgentToolDefinition } from "@beautonomi/agent-tools";
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
import {
  searchEntitiesForCopilot,
  readBookingSummary,
  readUserProfileSummary,
  readUserRecentBookings,
  readFinanceProviderSummary,
  readProviderProfileSummary,
  readProviderOnboardingProgress,
  listOpenTicketsForProvider,
  readProviderRiskSummary,
  readUserRiskSummary,
} from "./copilot-reads";

function tool(name: string): AgentToolDefinition<any, any> {
  const t = getTool(name);
  if (!t) throw new Error(`agent tool not registered: ${name}`);
  return t;
}

const boundSupportReadTicket = {
  ...tool("support.readTicket"),
  execute: (principal: Parameters<typeof readSupportTicket>[0], input: { ticketId: string }) =>
    readSupportTicket(principal, input.ticketId),
};

const boundSupportClassifyTicket = {
  ...tool("support.classifyTicket"),
  execute: (principal: Parameters<typeof classifySupportTicket>[0], input: Parameters<typeof classifySupportTicket>[1]) =>
    classifySupportTicket(principal, input),
};

const boundOpsReadSystemHealth = {
  ...tool("ops.readSystemHealth"),
  execute: (principal: Parameters<typeof readSystemHealth>[0], input: { environment: string }) =>
    readSystemHealth(principal, input.environment),
};

const boundFinanceReadPayout = {
  ...tool("finance.readPayout"),
  execute: (principal: Parameters<typeof readPayoutSummary>[0], input: { payoutId: string }) =>
    readPayoutSummary(principal, input.payoutId),
};

const boundFinanceReadRefund = {
  ...tool("finance.readRefund"),
  execute: (principal: Parameters<typeof readRefundSummary>[0], input: { refundId: string }) =>
    readRefundSummary(principal, input.refundId),
};

const boundProviderReadHealthSnapshot = {
  ...tool("provider.readHealthSnapshot"),
  execute: (principal: Parameters<typeof readProviderHealthSnapshot>[0], input: { providerId: string }) =>
    readProviderHealthSnapshot(principal, input.providerId),
};

const boundTrustReadFraudCase = {
  ...tool("trust.readFraudCase"),
  execute: (principal: Parameters<typeof readFraudCaseBriefing>[0], input: { caseId: string }) =>
    readFraudCaseBriefing(principal, input.caseId),
};

const boundSafetyReadContentReport = {
  ...tool("safety.readContentReport"),
  execute: (principal: Parameters<typeof readContentReportSummary>[0], input: { reportId: string }) =>
    readContentReportSummary(principal, input.reportId),
};

const boundAdminSearchEntities = {
  ...tool("admin.searchEntities"),
  execute: (principal: Parameters<typeof searchEntitiesForCopilot>[0], input: Parameters<typeof searchEntitiesForCopilot>[1]) =>
    searchEntitiesForCopilot(principal, input),
};

const boundBookingReadSummary = {
  ...tool("booking.readSummary"),
  execute: (principal: Parameters<typeof readBookingSummary>[0], input: { bookingId: string }) =>
    readBookingSummary(principal, input.bookingId),
};

const boundUserReadProfileSummary = {
  ...tool("user.readProfileSummary"),
  execute: (principal: Parameters<typeof readUserProfileSummary>[0], input: { userId: string }) =>
    readUserProfileSummary(principal, input.userId),
};

const boundUserReadRecentBookings = {
  ...tool("user.readRecentBookings"),
  execute: (principal: Parameters<typeof readUserRecentBookings>[0], input: { userId: string }) =>
    readUserRecentBookings(principal, input.userId),
};

const boundFinanceReadProviderSummary = {
  ...tool("finance.readProviderSummary"),
  execute: (
    principal: Parameters<typeof readFinanceProviderSummary>[0],
    input: Parameters<typeof readFinanceProviderSummary>[1],
  ) => readFinanceProviderSummary(principal, input),
};

const boundProviderReadProfileSummary = {
  ...tool("provider.readProfileSummary"),
  execute: (principal: Parameters<typeof readProviderProfileSummary>[0], input: { providerId: string }) =>
    readProviderProfileSummary(principal, input.providerId),
};

const boundProviderReadOnboardingProgress = {
  ...tool("provider.readOnboardingProgress"),
  execute: (principal: Parameters<typeof readProviderOnboardingProgress>[0], input: { providerId: string }) =>
    readProviderOnboardingProgress(principal, input.providerId),
};

const boundSupportListOpenTicketsForProvider = {
  ...tool("support.listOpenTicketsForProvider"),
  execute: (principal: Parameters<typeof listOpenTicketsForProvider>[0], input: { providerId: string }) =>
    listOpenTicketsForProvider(principal, input.providerId),
};

const boundTrustReadProviderRiskSummary = {
  ...tool("trust.readProviderRiskSummary"),
  execute: (principal: Parameters<typeof readProviderRiskSummary>[0], input: { providerId: string }) =>
    readProviderRiskSummary(principal, input.providerId),
};

const boundTrustReadUserRiskSummary = {
  ...tool("trust.readUserRiskSummary"),
  execute: (principal: Parameters<typeof readUserRiskSummary>[0], input: { userId: string }) =>
    readUserRiskSummary(principal, input.userId),
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
  boundAdminSearchEntities,
  boundBookingReadSummary,
  boundUserReadProfileSummary,
  boundUserReadRecentBookings,
  boundFinanceReadProviderSummary,
  boundProviderReadProfileSummary,
  boundProviderReadOnboardingProgress,
  boundSupportListOpenTicketsForProvider,
  boundTrustReadProviderRiskSummary,
  boundTrustReadUserRiskSummary,
];

export function getBoundTool(name: string, version = "1") {
  return BOUND_TOOL_REGISTRY.find((t) => t.name === name && t.version === version);
}
