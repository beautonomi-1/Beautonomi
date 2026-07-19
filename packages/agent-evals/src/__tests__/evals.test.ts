import { describe, it, expect } from "vitest";
import { checkWorkflowThresholds, runEvalSuite } from "../index";

describe("runEvalSuite", () => {
  it("passes built-in security and approval eval cases", () => {
    const result = runEvalSuite();
    expect(result.failed).toBe(0);
    expect(result.passed).toBeGreaterThan(0);
    expect(result.blocksDeploy).toBe(false);
  });
});

describe("checkWorkflowThresholds", () => {
  it("flags threshold violations for known workflows", () => {
    const result = checkWorkflowThresholds("payout-review", {
      unsupportedClaimRate: 0.01,
      schemaFailureRate: 0,
      humanOverrideRate: 0,
      costPerRunUsd: 0.01,
      evidenceCoverage: 1,
    });
    expect(result.ok).toBe(false);
    expect(result.violations).toContain("unsupported_claim_rate");
  });
});
