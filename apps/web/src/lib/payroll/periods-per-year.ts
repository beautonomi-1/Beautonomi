import type { PayPeriodType } from "./pay-run-engine";

/** Map pay run period_type to annualisation factor; custom uses rule-set seed. */
export function periodsPerYearFromPeriodType(
  periodType: PayPeriodType | string | null | undefined,
): number | undefined {
  switch (periodType) {
    case "weekly":
      return 52;
    case "biweekly":
      return 26;
    case "semi_monthly":
      return 24;
    case "monthly":
      return 12;
    default:
      return undefined;
  }
}
