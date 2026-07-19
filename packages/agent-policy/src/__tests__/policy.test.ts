import { describe, it, expect } from "vitest";
import { hashPayload, canonicalizeJson } from "../payload-hash";
import { canAcquireExecutionLease, evaluateAgentAuthz } from "../authz";
import { approvalsSatisfyRequirements, validateExecutionApproval } from "../approvals";

describe("payload-hash", () => {
  it("is stable regardless of key order", () => {
    expect(hashPayload({ b: 1, a: 2 })).toBe(hashPayload({ a: 2, b: 1 }));
  });
});

describe("execution lease", () => {
  it("allows reclaim from executing with expired lease", () => {
    expect(
      canAcquireExecutionLease({
        status: "executing",
        approvalExpiresAt: new Date(Date.now() + 60_000).toISOString(),
        approvedPayloadHash: "abc",
        expectedHash: "abc",
        leaseExpiresAt: new Date(Date.now() - 1000).toISOString(),
        executionAttempts: 1,
        maxAttempts: 3,
        nextRetryAt: null,
        blockApprovedExecution: false,
      }),
    ).toBe(true);
  });
});

describe("approvals", () => {
  it("requires distinct maker and checker", () => {
    const reqs = [
      { stage: 1, requiredRole: "admin_finance", requiredCount: 1 },
      { stage: 2, requiredRole: "admin_finance", requiredCount: 1, mustBeDistinctFromStage: 1 },
    ];
    const approvals = [
      {
        requirementId: "r1",
        stage: 1,
        reviewerId: "u1",
        reviewerRoleSnapshot: "admin_finance",
        decision: "approve" as const,
        payloadHash: "h",
        policyVersion: "1",
        decidedAt: new Date().toISOString(),
      },
      {
        requirementId: "r2",
        stage: 2,
        reviewerId: "u1",
        reviewerRoleSnapshot: "admin_finance",
        decision: "approve" as const,
        payloadHash: "h",
        policyVersion: "1",
        decidedAt: new Date().toISOString(),
      },
    ];
    expect(approvalsSatisfyRequirements(reqs, approvals, "h").satisfied).toBe(false);
  });
});

describe("execution approval policy", () => {
  it("does not require reviewer revalidation when policy unchanged", () => {
    expect(
      validateExecutionApproval({
        status: "approved",
        approvalExpiresAt: new Date(Date.now() + 60_000).toISOString(),
        approvedPayloadHash: "h",
        expectedHash: "h",
        policyVersion: "1",
        currentPolicyVersion: "1",
        materialDataChanged: false,
        revoked: false,
      }).ok,
    ).toBe(true);
  });
});
