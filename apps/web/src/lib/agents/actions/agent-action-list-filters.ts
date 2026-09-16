import type { UserRole } from "@/types/beautonomi";
import { canAccessSection } from "@beautonomi/admin-access";
import type { getEffectiveAdminSectionRoles } from "@/lib/supabase/api-helpers";
import { getAgentApprovalPolicy, listPolicedActionTypes } from "./approval-policy";

export function allowedActionTypesForRole(
  role: UserRole,
  effectiveRoles: Awaited<ReturnType<typeof getEffectiveAdminSectionRoles>>,
): string[] {
  const types: string[] = [];
  for (const actionType of listPolicedActionTypes()) {
    const policy = getAgentApprovalPolicy(actionType);
    if (policy && canAccessSection(role, policy.section, effectiveRoles)) {
      types.push(actionType);
    }
  }
  return types;
}

export const PENDING_AGENT_STATUSES = ["proposed", "approval_pending"] as const;
export const DECIDED_AGENT_STATUSES = [
  "approved",
  "rejected",
  "executed",
  "expired",
  "superseded",
  "retryable_failure",
  "permanent_failure",
] as const;
