import type { PayrollRuleSetRow } from "./jurisdictions/types";

export type TimePremiumLine = {
  code: string;
  hours: number;
  rateMultiplier: number;
  amount: number;
  description: string;
};

type OvertimeData = {
  weeklyThresholdHours?: number;
  multiplier?: number;
  sundayMultiplier?: number;
  publicHolidayMultiplier?: number;
};

/**
 * Estimate overtime premium lines from time cards + pack overtime rules (BCEA-style defaults in rule set data).
 */
export function computeOvertimePremiums(
  regularHours: number,
  sundayHours: number,
  publicHolidayHours: number,
  hourlyRate: number,
  overtimeRule: PayrollRuleSetRow | undefined,
): TimePremiumLine[] {
  const data = (overtimeRule?.data ?? {}) as OvertimeData;
  const threshold = data.weeklyThresholdHours ?? 45;
  const otMult = data.multiplier ?? 1.5;
  const sunMult = data.sundayMultiplier ?? 2;
  const holMult = data.publicHolidayMultiplier ?? 2;

  const lines: TimePremiumLine[] = [];
  const overtimeHours = Math.max(0, regularHours - threshold);
  if (overtimeHours > 0 && hourlyRate > 0) {
    const extra = hourlyRate * (otMult - 1) * overtimeHours;
    lines.push({
      code: "overtime_premium",
      hours: overtimeHours,
      rateMultiplier: otMult,
      amount: Math.round(extra * 100) / 100,
      description: "Overtime premium",
    });
  }
  if (sundayHours > 0 && hourlyRate > 0) {
    const extra = hourlyRate * (sunMult - 1) * sundayHours;
    lines.push({
      code: "sunday_premium",
      hours: sundayHours,
      rateMultiplier: sunMult,
      amount: Math.round(extra * 100) / 100,
      description: "Sunday premium",
    });
  }
  if (publicHolidayHours > 0 && hourlyRate > 0) {
    const extra = hourlyRate * (holMult - 1) * publicHolidayHours;
    lines.push({
      code: "public_holiday_premium",
      hours: publicHolidayHours,
      rateMultiplier: holMult,
      amount: Math.round(extra * 100) / 100,
      description: "Public holiday premium",
    });
  }
  return lines;
}
