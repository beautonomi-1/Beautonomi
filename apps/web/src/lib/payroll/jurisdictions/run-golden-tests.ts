import { resolveJurisdictionStatutory } from "./resolve-statutory";
import type { PayrollRuleSetRow, StatutoryContext } from "./types";

export type GoldenTestCase = {
  name?: string;
  input: Partial<StatutoryContext> & { jurisdictionCode: string; periodGross: number };
  expected: Array<{ code: string; amount: number; tolerance?: number }>;
};

export type GoldenTestResult = {
  name: string;
  passed: boolean;
  failures: string[];
};

export function runGoldenTestsForRuleSet(
  ruleSet: Pick<PayrollRuleSetRow, "jurisdiction_code" | "rule_type" | "data"> & {
    golden_tests?: unknown;
  },
  allRulesForJurisdiction: PayrollRuleSetRow[],
): GoldenTestResult[] {
  const cases = (Array.isArray(ruleSet.golden_tests) ? ruleSet.golden_tests : []) as GoldenTestCase[];
  if (!cases.length) return [];

  return cases.map((tc, idx) => {
    const name = tc.name ?? `case_${idx + 1}`;
    const ctx: StatutoryContext = {
      jurisdictionCode: tc.input.jurisdictionCode,
      payDate: tc.input.payDate ?? "2026-03-15",
      periodGross: tc.input.periodGross,
      ytdTaxable: tc.input.ytdTaxable ?? 0,
      employmentType: tc.input.employmentType ?? "employee",
      statutoryMode: tc.input.statutoryMode ?? "auto",
      ageYears: tc.input.ageYears,
    };
    const result = resolveJurisdictionStatutory(ctx, allRulesForJurisdiction);
    const failures: string[] = [];
    for (const exp of tc.expected) {
      const line = result.lines.find((l) => l.code === exp.code);
      const tol = exp.tolerance ?? 0.02;
      if (!line) {
        failures.push(`missing line ${exp.code}`);
        continue;
      }
      if (Math.abs(line.amount - exp.amount) > tol) {
        failures.push(`${exp.code}: expected ${exp.amount}, got ${line.amount}`);
      }
    }
    return { name, passed: failures.length === 0, failures };
  });
}
