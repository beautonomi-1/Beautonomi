import { z } from "zod";
import {
  ADMIN_SECTION_OPERATIONS,
  ADMIN_SECTION_SUPPORT,
  ADMIN_SECTION_FINANCE,
  ADMIN_SECTION_USERS_TRUST,
  ADMIN_SECTION_OVERVIEW,
  ADMIN_SECTION_PROVIDERS_OPERATIONS,
  ADMIN_SECTION_PROVIDER_OPS,
} from "@beautonomi/admin-access";
import type { AgentToolDefinition } from "./types";

const ticketViewSchema = z.object({
  id: z.string().uuid(),
  subject: z.string(),
  status: z.string(),
  priority: z.string().nullable(),
  category: z.string().nullable(),
  createdAt: z.string(),
});

export const supportReadTicketTool: AgentToolDefinition<
  { ticketId: string },
  z.infer<typeof ticketViewSchema>
> = {
  name: "support.readTicket",
  version: "1",
  description: "Read a support ticket summary (tenant-scoped, field-allowlisted)",
  requiredSection: ADMIN_SECTION_SUPPORT,
  mode: "read",
  baseRiskTier: 0,
  inputSchema: z.object({ ticketId: z.string().uuid() }),
  outputSchema: ticketViewSchema,
  maxRows: 1,
  maxOutputBytes: 8192,
  timeoutMs: 10_000,
  rateLimitPerMin: 120,
  retentionClass: "B",
  execute: async () => {
    throw new Error("support.readTicket must be wired in apps/web with service functions");
  },
};

export const supportClassifyTicketTool: AgentToolDefinition<
  { ticketId: string; subject: string; bodyPreview: string },
  { urgency: string; category: string; sentiment: string }
> = {
  name: "support.classifyTicket",
  version: "1",
  description: "Classify ticket urgency/category (deterministic output schema)",
  requiredSection: ADMIN_SECTION_SUPPORT,
  mode: "read",
  baseRiskTier: 0,
  inputSchema: z.object({
    ticketId: z.string().uuid(),
    subject: z.string().max(500),
    bodyPreview: z.string().max(2000),
  }),
  outputSchema: z.object({
    urgency: z.enum(["low", "medium", "high", "critical"]),
    category: z.string(),
    sentiment: z.enum(["neutral", "negative", "positive"]),
  }),
  maxRows: 1,
  maxOutputBytes: 4096,
  timeoutMs: 15_000,
  rateLimitPerMin: 60,
  retentionClass: "B",
  execute: async () => {
    throw new Error("support.classifyTicket wired in apps/web");
  },
};

export const opsReadSystemHealthTool: AgentToolDefinition<
  { environment: string },
  { status: string; checks: Array<{ name: string; ok: boolean }> }
> = {
  name: "ops.readSystemHealth",
  version: "1",
  description: "Read aggregated system health checks",
  requiredSection: ADMIN_SECTION_OPERATIONS,
  mode: "read",
  baseRiskTier: 0,
  inputSchema: z.object({ environment: z.enum(["production", "staging", "development"]) }),
  outputSchema: z.object({
    status: z.enum(["healthy", "degraded", "down"]),
    checks: z.array(z.object({ name: z.string(), ok: z.boolean() })),
  }),
  maxRows: 20,
  maxOutputBytes: 16384,
  timeoutMs: 10_000,
  rateLimitPerMin: 30,
  retentionClass: "A",
  execute: async () => {
    throw new Error("ops.readSystemHealth wired in apps/web");
  },
};

export const financeReadPayoutTool: AgentToolDefinition<
  { payoutId: string },
  { id: string; amount: number; currency: string; status: string; providerId: string }
> = {
  name: "finance.readPayout",
  version: "1",
  description: "Read payout summary (no banking details)",
  requiredSection: ADMIN_SECTION_FINANCE,
  mode: "read",
  baseRiskTier: 2,
  riskTier: (_p, input) => resolveRiskFromAmount(input as any),
  inputSchema: z.object({ payoutId: z.string().uuid() }),
  outputSchema: z.object({
    id: z.string().uuid(),
    amount: z.number(),
    currency: z.string(),
    status: z.string(),
    providerId: z.string().uuid(),
  }),
  maxRows: 1,
  maxOutputBytes: 4096,
  timeoutMs: 10_000,
  rateLimitPerMin: 60,
  retentionClass: "A",
  execute: async () => {
    throw new Error("finance.readPayout wired in apps/web");
  },
};

function resolveRiskFromAmount(_input: { amount?: number }): 0 | 1 | 2 | 3 {
  return 2;
}

export const trustReadFraudCaseTool: AgentToolDefinition<
  { caseId: string },
  { id: string; status: string; riskScore: number | null; signalsSummary: string }
> = {
  name: "trust.readFraudCase",
  version: "1",
  description: "Read fraud case briefing (redacted)",
  requiredSection: ADMIN_SECTION_USERS_TRUST,
  mode: "read",
  baseRiskTier: 3,
  inputSchema: z.object({ caseId: z.string().uuid() }),
  outputSchema: z.object({
    id: z.string().uuid(),
    status: z.string(),
    riskScore: z.number().nullable(),
    signalsSummary: z.string(),
  }),
  maxRows: 1,
  maxOutputBytes: 8192,
  timeoutMs: 10_000,
  rateLimitPerMin: 30,
  retentionClass: "A",
  execute: async () => {
    throw new Error("trust.readFraudCase wired in apps/web");
  },
};

export const financeReadRefundTool: AgentToolDefinition<
  { refundId: string },
  { id: string; amount: number; currency: string; status: string; bookingId: string | null }
> = {
  name: "finance.readRefund",
  version: "1",
  description: "Read pending refund summary (no banking details)",
  requiredSection: ADMIN_SECTION_FINANCE,
  mode: "read",
  baseRiskTier: 2,
  inputSchema: z.object({ refundId: z.string().uuid() }),
  outputSchema: z.object({
    id: z.string().uuid(),
    amount: z.number(),
    currency: z.string(),
    status: z.string(),
    bookingId: z.string().uuid().nullable(),
  }),
  maxRows: 1,
  maxOutputBytes: 4096,
  timeoutMs: 10_000,
  rateLimitPerMin: 60,
  retentionClass: "A",
  execute: async () => {
    throw new Error("finance.readRefund wired in apps/web");
  },
};

export const providerReadHealthSnapshotTool: AgentToolDefinition<
  { providerId: string },
  { providerId: string; completedBookings30d: number; completedBookingsPrior30d: number; status: string }
> = {
  name: "provider.readHealthSnapshot",
  version: "1",
  description: "Read provider booking health snapshot",
  requiredSection: ADMIN_SECTION_PROVIDERS_OPERATIONS,
  mode: "read",
  baseRiskTier: 1,
  inputSchema: z.object({ providerId: z.string().uuid() }),
  outputSchema: z.object({
    providerId: z.string().uuid(),
    completedBookings30d: z.number(),
    completedBookingsPrior30d: z.number(),
    status: z.string(),
  }),
  maxRows: 1,
  maxOutputBytes: 8192,
  timeoutMs: 10_000,
  rateLimitPerMin: 60,
  retentionClass: "B",
  execute: async () => {
    throw new Error("provider.readHealthSnapshot wired in apps/web");
  },
};

export const safetyReadContentReportTool: AgentToolDefinition<
  { reportId: string },
  { id: string; targetType: string; targetId: string; reason: string; status: string }
> = {
  name: "safety.readContentReport",
  version: "1",
  description: "Read content report summary (UGC targets only)",
  requiredSection: ADMIN_SECTION_USERS_TRUST,
  mode: "read",
  baseRiskTier: 2,
  inputSchema: z.object({ reportId: z.string().uuid() }),
  outputSchema: z.object({
    id: z.string().uuid(),
    targetType: z.string(),
    targetId: z.string().uuid(),
    reason: z.string(),
    status: z.string(),
  }),
  maxRows: 1,
  maxOutputBytes: 8192,
  timeoutMs: 10_000,
  rateLimitPerMin: 30,
  retentionClass: "A",
  execute: async () => {
    throw new Error("safety.readContentReport wired in apps/web");
  },
};

export const adminSearchEntitiesTool: AgentToolDefinition<
  { query: string; kinds?: ("provider" | "booking" | "user")[] },
  { matches: Array<{ kind: string; id: string; label: string; subtitle?: string }> }
> = {
  name: "admin.searchEntities",
  version: "1",
  description: "Search users, providers, and bookings by name, email, phone, or booking number",
  requiredSection: ADMIN_SECTION_OVERVIEW,
  mode: "read",
  baseRiskTier: 0,
  inputSchema: z.object({
    query: z.string().min(2).max(200),
    kinds: z.array(z.enum(["provider", "booking", "user"])).optional(),
  }),
  outputSchema: z.object({
    matches: z.array(
      z.object({
        kind: z.string(),
        id: z.string(),
        label: z.string(),
        subtitle: z.string().optional(),
      }),
    ),
  }),
  maxRows: 15,
  maxOutputBytes: 16384,
  timeoutMs: 15_000,
  rateLimitPerMin: 60,
  retentionClass: "B",
  execute: async () => {
    throw new Error("admin.searchEntities wired in apps/web");
  },
};

export const bookingReadSummaryTool: AgentToolDefinition<
  { bookingId: string },
  Record<string, unknown>
> = {
  name: "booking.readSummary",
  version: "1",
  description: "Read booking summary (tenant-scoped, field-allowlisted)",
  requiredSection: ADMIN_SECTION_PROVIDERS_OPERATIONS,
  mode: "read",
  baseRiskTier: 1,
  inputSchema: z.object({ bookingId: z.string().uuid() }),
  outputSchema: z.record(z.string(), z.unknown()),
  maxRows: 1,
  maxOutputBytes: 8192,
  timeoutMs: 10_000,
  rateLimitPerMin: 120,
  retentionClass: "B",
  execute: async () => {
    throw new Error("booking.readSummary wired in apps/web");
  },
};

export const userReadProfileSummaryTool: AgentToolDefinition<
  { userId: string },
  Record<string, unknown>
> = {
  name: "user.readProfileSummary",
  version: "1",
  description: "Read customer/user profile summary for admin copilot",
  requiredSection: ADMIN_SECTION_USERS_TRUST,
  mode: "read",
  baseRiskTier: 2,
  inputSchema: z.object({ userId: z.string().uuid() }),
  outputSchema: z.record(z.string(), z.unknown()),
  maxRows: 1,
  maxOutputBytes: 16384,
  timeoutMs: 15_000,
  rateLimitPerMin: 60,
  retentionClass: "B",
  execute: async () => {
    throw new Error("user.readProfileSummary wired in apps/web");
  },
};

export const userReadRecentBookingsTool: AgentToolDefinition<
  { userId: string },
  Record<string, unknown>
> = {
  name: "user.readRecentBookings",
  version: "1",
  description: "Read recent bookings for a customer user",
  requiredSection: ADMIN_SECTION_USERS_TRUST,
  mode: "read",
  baseRiskTier: 1,
  inputSchema: z.object({ userId: z.string().uuid() }),
  outputSchema: z.record(z.string(), z.unknown()),
  maxRows: 5,
  maxOutputBytes: 8192,
  timeoutMs: 10_000,
  rateLimitPerMin: 60,
  retentionClass: "B",
  execute: async () => {
    throw new Error("user.readRecentBookings wired in apps/web");
  },
};

export const financeReadProviderSummaryTool: AgentToolDefinition<
  { providerId: string; startDate?: string; endDate?: string },
  Record<string, unknown>
> = {
  name: "finance.readProviderSummary",
  version: "1",
  description: "Provider earnings, payouts, hold, and subscription summary",
  requiredSection: ADMIN_SECTION_FINANCE,
  mode: "read",
  baseRiskTier: 2,
  inputSchema: z.object({
    providerId: z.string().uuid(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
  }),
  outputSchema: z.record(z.string(), z.unknown()),
  maxRows: 1,
  maxOutputBytes: 16384,
  timeoutMs: 20_000,
  rateLimitPerMin: 30,
  retentionClass: "A",
  execute: async () => {
    throw new Error("finance.readProviderSummary wired in apps/web");
  },
};

export const providerReadProfileSummaryTool: AgentToolDefinition<
  { providerId: string },
  Record<string, unknown>
> = {
  name: "provider.readProfileSummary",
  version: "1",
  description: "Provider profile, verification, Yoco flags, recent bookings",
  requiredSection: ADMIN_SECTION_PROVIDERS_OPERATIONS,
  mode: "read",
  baseRiskTier: 1,
  inputSchema: z.object({ providerId: z.string().uuid() }),
  outputSchema: z.record(z.string(), z.unknown()),
  maxRows: 1,
  maxOutputBytes: 16384,
  timeoutMs: 15_000,
  rateLimitPerMin: 60,
  retentionClass: "B",
  execute: async () => {
    throw new Error("provider.readProfileSummary wired in apps/web");
  },
};

export const providerReadOnboardingProgressTool: AgentToolDefinition<
  { providerId: string },
  Record<string, unknown>
> = {
  name: "provider.readOnboardingProgress",
  version: "1",
  description: "Provider onboarding draft progress",
  requiredSection: ADMIN_SECTION_PROVIDER_OPS,
  mode: "read",
  baseRiskTier: 1,
  inputSchema: z.object({ providerId: z.string().uuid() }),
  outputSchema: z.record(z.string(), z.unknown()),
  maxRows: 1,
  maxOutputBytes: 8192,
  timeoutMs: 10_000,
  rateLimitPerMin: 60,
  retentionClass: "B",
  execute: async () => {
    throw new Error("provider.readOnboardingProgress wired in apps/web");
  },
};

export const supportListOpenTicketsForProviderTool: AgentToolDefinition<
  { providerId: string },
  Record<string, unknown>
> = {
  name: "support.listOpenTicketsForProvider",
  version: "1",
  description: "List open support tickets for a provider",
  requiredSection: ADMIN_SECTION_SUPPORT,
  mode: "read",
  baseRiskTier: 1,
  inputSchema: z.object({ providerId: z.string().uuid() }),
  outputSchema: z.record(z.string(), z.unknown()),
  maxRows: 10,
  maxOutputBytes: 16384,
  timeoutMs: 10_000,
  rateLimitPerMin: 60,
  retentionClass: "B",
  execute: async () => {
    throw new Error("support.listOpenTicketsForProvider wired in apps/web");
  },
};

export const trustReadProviderRiskSummaryTool: AgentToolDefinition<
  { providerId: string },
  Record<string, unknown>
> = {
  name: "trust.readProviderRiskSummary",
  version: "1",
  description: "Open fraud cases and disputes linked to a provider",
  requiredSection: ADMIN_SECTION_USERS_TRUST,
  mode: "read",
  baseRiskTier: 3,
  inputSchema: z.object({ providerId: z.string().uuid() }),
  outputSchema: z.record(z.string(), z.unknown()),
  maxRows: 20,
  maxOutputBytes: 8192,
  timeoutMs: 15_000,
  rateLimitPerMin: 30,
  retentionClass: "A",
  execute: async () => {
    throw new Error("trust.readProviderRiskSummary wired in apps/web");
  },
};

export const trustReadUserRiskSummaryTool: AgentToolDefinition<
  { userId: string },
  Record<string, unknown>
> = {
  name: "trust.readUserRiskSummary",
  version: "1",
  description: "Open fraud cases and disputes for a user",
  requiredSection: ADMIN_SECTION_USERS_TRUST,
  mode: "read",
  baseRiskTier: 3,
  inputSchema: z.object({ userId: z.string().uuid() }),
  outputSchema: z.record(z.string(), z.unknown()),
  maxRows: 20,
  maxOutputBytes: 8192,
  timeoutMs: 15_000,
  rateLimitPerMin: 30,
  retentionClass: "A",
  execute: async () => {
    throw new Error("trust.readUserRiskSummary wired in apps/web");
  },
};

export const TOOL_REGISTRY = [
  supportReadTicketTool,
  supportClassifyTicketTool,
  opsReadSystemHealthTool,
  financeReadPayoutTool,
  financeReadRefundTool,
  providerReadHealthSnapshotTool,
  trustReadFraudCaseTool,
  safetyReadContentReportTool,
  adminSearchEntitiesTool,
  bookingReadSummaryTool,
  userReadProfileSummaryTool,
  userReadRecentBookingsTool,
  financeReadProviderSummaryTool,
  providerReadProfileSummaryTool,
  providerReadOnboardingProgressTool,
  supportListOpenTicketsForProviderTool,
  trustReadProviderRiskSummaryTool,
  trustReadUserRiskSummaryTool,
] as const;

export function getTool(name: string, version = "1") {
  return TOOL_REGISTRY.find((t) => t.name === name && t.version === version);
}
