import { addMoney } from "@beautonomi/utils";
import type { NetPayResult } from "./net-pay";
import { computeNetPay } from "./net-pay";

export type GrossPayParts = {
  commissionAmount: number;
  hourlyAmount: number;
  salaryAmount: number;
  tipsAmount: number;
  bonusAmount?: number;
  currency?: string;
};

export function assembleGrossPay(parts: GrossPayParts): number {
  const currency = parts.currency ?? "ZAR";
  let total = 0;
  total = addMoney(total, parts.commissionAmount, currency);
  total = addMoney(total, parts.hourlyAmount, currency);
  total = addMoney(total, parts.salaryAmount, currency);
  total = addMoney(total, parts.tipsAmount, currency);
  total = addMoney(total, parts.bonusAmount ?? 0, currency);
  return total;
}

export type PayRunItemDraft = {
  staffId: string;
  staffName: string;
  grossPay: number;
  commissionAmount: number;
  hourlyAmount: number;
  salaryAmount: number;
  tipsAmount: number;
  manualDeductions: number;
  taxDeduction: number;
  uifContribution: number;
  netPay: number;
  carryForwardOut?: number;
};

export function buildPayRunItem(
  staffId: string,
  staffName: string,
  parts: GrossPayParts,
  deductions: {
    manualDeductions?: number;
    taxDeduction?: number;
    uifContribution?: number;
    carryForwardBalance?: number;
  } = {},
): PayRunItemDraft {
  const currency = parts.currency ?? "ZAR";
  const grossPay = assembleGrossPay(parts);
  const net: NetPayResult = computeNetPay({
    grossPay,
    manualDeductions: deductions.manualDeductions,
    taxDeduction: deductions.taxDeduction,
    uifContribution: deductions.uifContribution,
    carryForwardBalance: deductions.carryForwardBalance,
    currency,
  });

  return {
    staffId,
    staffName,
    grossPay: round2(grossPay),
    commissionAmount: round2(parts.commissionAmount),
    hourlyAmount: round2(parts.hourlyAmount),
    salaryAmount: round2(parts.salaryAmount),
    tipsAmount: round2(parts.tipsAmount),
    manualDeductions: round2(deductions.manualDeductions ?? 0),
    taxDeduction: round2(deductions.taxDeduction ?? 0),
    uifContribution: round2(deductions.uifContribution ?? 0),
    netPay: net.netPay,
    carryForwardOut: net.nextCarryForward !== 0 ? net.nextCarryForward : undefined,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
