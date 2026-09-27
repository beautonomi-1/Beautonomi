import { addMoney } from "@beautonomi/utils";

export type NetPayInput = {
  grossPay: number;
  manualDeductions?: number;
  taxDeduction?: number;
  uifContribution?: number;
  /** Negative balance from prior period (deducted before clamp). */
  carryForwardBalance?: number;
  currency?: string;
};

export type NetPayResult = {
  netPay: number;
  /** Amount to carry to next run when net would be negative. */
  nextCarryForward: number;
};

/**
 * Net pay with optional carry-forward: staff cannot receive negative net;
 * shortfall becomes nextCarryForward (stored as pay_run item line).
 */
export function computeNetPay(input: NetPayInput): NetPayResult {
  const currency = input.currency ?? "ZAR";
  const gross = Number(input.grossPay) || 0;
  const deductions =
    (Number(input.manualDeductions) || 0) +
    (Number(input.taxDeduction) || 0) +
    (Number(input.uifContribution) || 0);
  const carry = Number(input.carryForwardBalance) || 0;

  const raw = addMoney(addMoney(gross, -deductions, currency), carry, currency);
  if (raw >= 0) {
    return { netPay: round2(raw), nextCarryForward: 0 };
  }
  return { netPay: 0, nextCarryForward: round2(raw) };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
