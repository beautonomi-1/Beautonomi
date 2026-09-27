import { describe, it, expect } from "vitest";
import { runGoldenTestsForRuleSet } from "../jurisdictions/run-golden-tests";
import type { PayrollRuleSetRow } from "../jurisdictions/types";

describe("ZA golden tests", () => {
  it("passes UIF ceiling case", () => {
    const social: PayrollRuleSetRow = {
      id: "1",
      jurisdiction_code: "ZA",
      rule_type: "social_contributions",
      effective_from: "2026-03-01",
      effective_to: null,
      status: "published",
      data: { uifRateEmployee: 0.01, uifCeiling: 17712 },
      golden_tests: [
        {
          name: "uif_at_ceiling",
          input: { jurisdictionCode: "ZA", periodGross: 20000, statutoryMode: "auto" },
          expected: [{ code: "uif_employee", amount: 177.12, tolerance: 0.05 }],
        },
      ],
    };
    const results = runGoldenTestsForRuleSet(social, [social]);
    expect(results.every((r) => r.passed)).toBe(true);
  });
});
