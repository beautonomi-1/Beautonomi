import type { PayRunItem } from "./pay-run-engine";

export function payRunItemToInsertRow(payRunId: string, item: PayRunItem) {
  return {
    pay_run_id: payRunId,
    staff_id: item.staffId,
    gross_pay: item.grossPay,
    commission_amount: item.commissionAmount,
    hourly_amount: item.hourlyAmount,
    salary_amount: item.salaryAmount,
    tips_amount: item.tipsAmount,
    manual_deductions: item.manualDeductions,
    tax_deduction: item.taxDeduction,
    uif_contribution: item.uifContribution,
    taxable_income: item.taxableIncome ?? null,
    net_pay: item.netPay,
    commission_clawback: item.commissionClawback ?? 0,
    carry_forward_in: item.carryForwardIn ?? 0,
    carry_forward_out: item.carryForwardOut ?? 0,
  };
}
