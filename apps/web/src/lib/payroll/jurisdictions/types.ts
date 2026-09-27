export type JurisdictionSupportLevel = "manual" | "gross_only" | "estimate" | "full";

export type PayrollRuleType =
  | "income_tax"
  | "social_contributions"
  | "employer_levies"
  | "minimum_wage"
  | "overtime"
  | "public_holidays"
  | "leave_entitlements"
  | "tips_law"
  | "payslip_requirements"
  | "record_retention"
  | "contractor_rules";

export type StatutoryLine = {
  code: string;
  kind: "deduction" | "employer_cost";
  amount: number;
  description: string;
  editable?: boolean;
  sourceRuleSetId?: string;
};

export type StatutoryContext = {
  jurisdictionCode: string;
  payDate: string;
  periodGross: number;
  ytdTaxable: number;
  employmentType: "employee" | "contractor" | "apprentice";
  statutoryMode: "auto" | "manual" | "none";
  ageYears?: number;
};

export type StatutoryResult = {
  mode: "auto" | "manual";
  reason?: string;
  lines: StatutoryLine[];
};

export type PayrollRuleSetRow = {
  id: string;
  jurisdiction_code: string;
  rule_type: PayrollRuleType;
  effective_from: string;
  effective_to: string | null;
  status: string;
  data: Record<string, unknown>;
  golden_tests?: unknown;
};
