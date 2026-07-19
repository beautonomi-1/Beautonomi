import { canAccessSection, type AdminSection } from "@beautonomi/admin-access";
import type { AuthzContext, AuthzResult, RiskTier, ToolMode } from "./types";

export function evaluateAgentAuthz(ctx: AuthzContext, mode: ToolMode): AuthzResult {
  if (!ctx.module.masterEnabled) {
    return { allowed: false, reason: "master_disabled" };
  }
  if (ctx.emergency.stopNewRuns || ctx.emergency.stopAllToolCalls) {
    return { allowed: false, reason: "emergency_stop" };
  }
  if (ctx.operational.state !== "active") {
    return { allowed: false, reason: "agent_not_active", detail: ctx.operational.state };
  }
  if (ctx.actorActive === false) {
    return { allowed: false, reason: "actor_inactive" };
  }
  if (ctx.tenantValid === false) {
    return { allowed: false, reason: "tenant_invalid" };
  }
  if (!ctx.toolGrant?.active) {
    return { allowed: false, reason: "tool_not_granted" };
  }
  const role = ctx.principal.role as Parameters<typeof canAccessSection>[0];
  if (!canAccessSection(role, ctx.requiredSection, ctx.sectionRolesOverride as any)) {
    return { allowed: false, reason: "section_denied" };
  }
  if (ctx.resolvedRiskTier > ctx.toolGrant.riskCeiling) {
    return { allowed: false, reason: "risk_ceiling_exceeded" };
  }
  if (ctx.module.shadowMode && mode !== "read") {
    return { allowed: false, reason: "shadow_blocks_mutation" };
  }
  return { allowed: true };
}

export function isOpenActionStatus(status: string): boolean {
  return ["proposed", "approval_pending", "approved", "executing"].includes(status);
}

export function canAcquireExecutionLease(params: {
  status: string;
  approvalExpiresAt: string | null;
  approvedPayloadHash: string | null;
  expectedHash: string;
  leaseExpiresAt: string | null;
  executionAttempts: number;
  maxAttempts: number;
  nextRetryAt: string | null;
  blockApprovedExecution: boolean;
}): boolean {
  if (params.blockApprovedExecution) return false;
  if (params.approvalExpiresAt && new Date(params.approvalExpiresAt) <= new Date()) return false;
  if (params.approvedPayloadHash !== params.expectedHash) return false;
  if (params.executionAttempts >= params.maxAttempts && params.status === "retryable_failure") {
    return false;
  }
  const leaseExpired = !params.leaseExpiresAt || new Date(params.leaseExpiresAt) < new Date();
  if (params.status === "approved" && leaseExpired) return true;
  if (params.status === "executing" && leaseExpired) return true;
  if (
    params.status === "retryable_failure" &&
    leaseExpired &&
    (!params.nextRetryAt || new Date(params.nextRetryAt) <= new Date()) &&
    params.executionAttempts < params.maxAttempts
  ) {
    return true;
  }
  return false;
}

export function resolveRiskTier(base: RiskTier, amountUsd?: number): RiskTier {
  if (amountUsd != null && amountUsd >= 10_000) return 3 as RiskTier;
  if (amountUsd != null && amountUsd >= 1_000) return Math.max(base, 2) as RiskTier;
  return base;
}
