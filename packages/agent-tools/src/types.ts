import type { AdminSection } from "@beautonomi/admin-access";
import type { AgentPrincipal, RiskTier, ToolMode } from "@beautonomi/agent-policy";
import type { ZodType } from "zod";

export type AgentToolDefinition<I, O> = {
  name: string;
  version: string;
  description: string;
  requiredSection: AdminSection;
  mode: ToolMode;
  baseRiskTier: RiskTier;
  riskTier?: (principal: AgentPrincipal, input: I) => RiskTier;
  inputSchema: ZodType<I>;
  outputSchema: ZodType<O>;
  maxRows: number;
  maxOutputBytes: number;
  timeoutMs: number;
  rateLimitPerMin: number;
  retentionClass: "A" | "B" | "C" | "D";
  execute: (principal: AgentPrincipal, input: I) => Promise<O>;
};

export type ToolExecutionResult<O> =
  | { ok: true; output: O; toolCallId: string }
  | { ok: false; error: string; policyDenied?: boolean };
