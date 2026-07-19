import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentApprovalPolicy, listPolicedActionTypes } from "../actions/approval-policy";

const webRoot = join(__dirname, "../../../..");

describe("agent approval policy matrix", () => {
  it("covers every action type the executor supports", () => {
    const executorSource = readFileSync(
      join(webRoot, "src/lib/agents/actions/execute-approved-agent-action.ts"),
      "utf8",
    );
    const supported = [...executorSource.matchAll(/actionType === "([\w.]+)"/g)].map((m) => m[1]);
    expect(supported.length).toBeGreaterThanOrEqual(7);
    for (const actionType of supported) {
      expect(getAgentApprovalPolicy(actionType), `missing policy for ${actionType}`).not.toBeNull();
    }
  });

  it("requires two distinct finance approvers for payout decisions (maker-checker)", () => {
    const policy = getAgentApprovalPolicy("payout.review");
    expect(policy?.requiredCount).toBe(2);
    expect(policy?.approverRoles).toContain("admin_finance");
  });

  it("routes support actions to support staff, trust actions to trust admins", () => {
    expect(getAgentApprovalPolicy("support.reply")?.section).toBe("support");
    expect(getAgentApprovalPolicy("support.assign")?.approverRoles).toContain("support_agent");
    expect(getAgentApprovalPolicy("support.resolve")?.section).toBe("support");
    expect(getAgentApprovalPolicy("fraud.briefing")?.section).toBe("users_trust");
    expect(getAgentApprovalPolicy("dispute.briefing")?.section).toBe("users_trust");
    expect(getAgentApprovalPolicy("report.briefing")?.section).toBe("users_trust");
    expect(getAgentApprovalPolicy("trust.open_case")?.section).toBe("users_trust");
    expect(getAgentApprovalPolicy("provider.outreach")?.section).toBe("providers_operations");
    expect(getAgentApprovalPolicy("refund.briefing")?.section).toBe("finance");
    expect(getAgentApprovalPolicy("membership.dunning")?.section).toBe("finance");
  });

  it("executor reopens resolved tickets only for CSAT recovery replies", () => {
    const executorSource = readFileSync(
      join(webRoot, "src/lib/agents/actions/execute-approved-agent-action.ts"),
      "utf8",
    );
    expect(executorSource).toContain('followUpKind === "csat_recovery"');
    expect(executorSource).toContain("ticketUpdate.resolved_at = null");
    expect(executorSource).toMatch(/isCsatRecovery[\s\S]*ticket_status_/);
  });

  it("returns null for unknown action types so routes refuse to decide them", () => {
    expect(getAgentApprovalPolicy("payout.execute_directly")).toBeNull();
    expect(getAgentApprovalPolicy("")).toBeNull();
  });

  it("every policy names at least one approver role and a positive count", () => {
    for (const actionType of listPolicedActionTypes()) {
      const policy = getAgentApprovalPolicy(actionType)!;
      expect(policy.approverRoles.length).toBeGreaterThan(0);
      expect(policy.requiredCount).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("approve/reject routes use the server-side policy (regression)", () => {
  const approveSource = readFileSync(
    join(webRoot, "src/app/api/admin/agent-actions/[id]/approve/route.ts"),
    "utf8",
  );
  const rejectSource = readFileSync(
    join(webRoot, "src/app/api/admin/agent-actions/[id]/reject/route.ts"),
    "utf8",
  );

  it("approve route looks up the policy and never reads requirements from the request body", () => {
    expect(approveSource).toContain("getAgentApprovalPolicy");
    expect(approveSource).not.toContain("body.stage");
    expect(approveSource).not.toContain("body.required_role");
    expect(approveSource).not.toContain("body.required_count");
    expect(approveSource).toContain("allowedReviewerRoles: policy.approverRoles");
  });

  it("reject route looks up the policy and never reads requirements from the request body", () => {
    expect(rejectSource).toContain("getAgentApprovalPolicy");
    expect(rejectSource).not.toContain("body.stage");
    expect(rejectSource).not.toContain("body.required_role");
  });
});
