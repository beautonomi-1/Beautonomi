import { hashPayload } from "./payload-hash";

export type ApprovalRequirement = {
  stage: number;
  requiredRole: string;
  requiredCount: number;
  mustBeDistinctFromStage?: number | null;
  requireCurrentAuthorityAtExecution?: boolean;
  expiresAt?: string | null;
};

export type ApprovalRecord = {
  requirementId: string;
  stage: number;
  reviewerId: string;
  reviewerRoleSnapshot: string;
  decision: "approve" | "reject";
  payloadHash: string;
  policyVersion: string;
  decidedAt: string;
};

export function approvalsSatisfyRequirements(
  requirements: ApprovalRequirement[],
  approvals: ApprovalRecord[],
  currentPayloadHash: string,
): { satisfied: boolean; rejected: boolean } {
  const validApprovals = approvals.filter(
    (a) => a.decision === "approve" && a.payloadHash === currentPayloadHash,
  );
  if (approvals.some((a) => a.decision === "reject" && a.payloadHash === currentPayloadHash)) {
    return { satisfied: false, rejected: true };
  }
  for (const req of requirements) {
    const stageApprovals = validApprovals.filter((a) => a.stage === req.stage);
    const distinctReviewers = new Set(stageApprovals.map((a) => a.reviewerId));
    if (distinctReviewers.size < req.requiredCount) {
      return { satisfied: false, rejected: false };
    }
    if (req.mustBeDistinctFromStage != null) {
      const otherStage = validApprovals.filter((a) => a.stage === req.mustBeDistinctFromStage);
      const otherIds = new Set(otherStage.map((a) => a.reviewerId));
      for (const id of distinctReviewers) {
        if (otherIds.has(id)) return { satisfied: false, rejected: false };
      }
    }
  }
  return { satisfied: true, rejected: false };
}

/** At execution: do not re-check reviewer current role unless flagged on requirement. */
export function validateExecutionApproval(params: {
  status: string;
  approvalExpiresAt: string | null;
  approvedPayloadHash: string | null;
  expectedHash: string;
  policyVersion: string;
  currentPolicyVersion: string;
  materialDataChanged: boolean;
  revoked: boolean;
}): { ok: boolean; reason?: string } {
  if (params.revoked) return { ok: false, reason: "revoked" };
  if (!["approved", "executing", "retryable_failure"].includes(params.status)) {
    return { ok: false, reason: "invalid_status" };
  }
  if (params.approvalExpiresAt && new Date(params.approvalExpiresAt) <= new Date()) {
    return { ok: false, reason: "expired" };
  }
  if (params.approvedPayloadHash !== params.expectedHash) {
    return { ok: false, reason: "payload_hash_mismatch" };
  }
  if (params.policyVersion !== params.currentPolicyVersion || params.materialDataChanged) {
    return { ok: false, reason: "requires_reapproval" };
  }
  return { ok: true };
}

export function buildApprovalPayloadHash(payload: unknown): string {
  return hashPayload(payload);
}
