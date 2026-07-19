import { describe, it, expect } from "vitest";
import { runEvalSuite, checkWorkflowThresholds } from "@beautonomi/agent-evals";

describe("agent-evals", () => {
  it("passes default security suite", () => {
    const r = runEvalSuite();
    expect(r.failed).toBe(0);
    expect(r.blocksDeploy).toBe(false);
  });

  it("enforces workflow thresholds", () => {
    const r = checkWorkflowThresholds("support-classification", {
      unsupportedClaimRate: 0,
      schemaFailureRate: 0,
      humanOverrideRate: 0.1,
      costPerRunUsd: 0.01,
      evidenceCoverage: 0.9,
      precision: 0.9,
    });
    expect(r.ok).toBe(true);
  });
});
