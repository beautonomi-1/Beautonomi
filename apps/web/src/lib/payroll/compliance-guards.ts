import type { PayrollRuleSetRow } from "./jurisdictions/types";

export type ComplianceWarning = {
  code: string;
  message: string;
  suggestedTopUp?: number;
};

type MinWageData = { hourlyRate?: number; currency?: string };
type TipsLawData = { staffMustReceiveTips?: boolean; blockedPolicies?: string[] };

/**
 * Compare gross pay against statutory minimum wage for hours worked (warning + optional top-up).
 */
export function checkMinimumWage(
  grossPay: number,
  hoursWorked: number,
  minWageRule: PayrollRuleSetRow | undefined,
): ComplianceWarning | null {
  if (hoursWorked <= 0) return null;
  const data = (minWageRule?.data ?? {}) as MinWageData;
  const rate = Number(data.hourlyRate ?? 0);
  if (rate <= 0) return null;
  const required = rate * hoursWorked;
  if (grossPay + 0.01 >= required) return null;
  return {
    code: "minimum_wage_top_up",
    message: `Pay is below the minimum wage for ${hoursWorked.toFixed(1)} hours worked.`,
    suggestedTopUp: Math.round((required - grossPay) * 100) / 100,
  };
}

/**
 * Enforce tips-law pack rules (e.g. block keep_all where illegal).
 */
export function checkTipsPolicy(
  tipsPolicy: string | null | undefined,
  tipsLawRule: PayrollRuleSetRow | undefined,
): ComplianceWarning | null {
  const data = (tipsLawRule?.data ?? {}) as TipsLawData;
  if (!data.staffMustReceiveTips) return null;
  const blocked = data.blockedPolicies ?? ["keep_all"];
  const policy = tipsPolicy ?? "inherit";
  if (blocked.includes(policy)) {
    return {
      code: "tips_law_violation",
      message: "This tips policy is not allowed in your jurisdiction. Use pass-through or pool allocation.",
    };
  }
  return null;
}

export function checkContractorClassification(
  employmentType: string,
  contractorRule: PayrollRuleSetRow | undefined,
): ComplianceWarning | null {
  if (employmentType !== "contractor") return null;
  const prompt = (contractorRule?.data as { classificationPrompt?: string } | undefined)
    ?.classificationPrompt;
  if (!prompt) return null;
  return { code: "contractor_review", message: prompt };
}
