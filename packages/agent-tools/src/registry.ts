import { z } from "zod";
import { ADMIN_SECTION_OPERATIONS, ADMIN_SECTION_SUPPORT, ADMIN_SECTION_FINANCE, ADMIN_SECTION_USERS_TRUST } from "@beautonomi/admin-access";
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

export const TOOL_REGISTRY = [
  supportReadTicketTool,
  supportClassifyTicketTool,
  opsReadSystemHealthTool,
  financeReadPayoutTool,
  trustReadFraudCaseTool,
] as const;

export function getTool(name: string, version = "1") {
  return TOOL_REGISTRY.find((t) => t.name === name && t.version === version);
}
