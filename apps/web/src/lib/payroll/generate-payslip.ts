import type { SupabaseClient } from "@supabase/supabase-js";
import { addMoney, subtractMoney } from "@beautonomi/utils";
import { computeNetPay } from "./net-pay";
import { getProviderPayrollCountry } from "./provider-payroll-context";
import { loadStaffPayrollMetaBatch } from "./resolve-staff-payroll-meta";

export type PayslipPayload = {
  html: string;
  filename: string;
};

export type PayslipView = {
  staffName: string;
  employerName: string;
  periodStart: string;
  periodEnd: string;
  currency: string;
  commission: number;
  hourly: number;
  salary: number;
  tips: number;
  gross: number;
  /** Already subtracted inside commission. Shown so the reversal is visible, not deducted again. */
  clawback: number;
  carryIn: number;
  manual: number;
  tax: number;
  uif: number;
  net: number;
  carryOut: number;
  notes?: string;
  /** How this person is engaged for tax. A fixed end date stays an employee. */
  engagement?: "employee" | "contractor" | "apprentice";
  /** estimated = calculated PAYE/UIF; entered = typed on the draft; not_calculated = left off. */
  taxTreatment?: "estimated" | "entered" | "not_calculated";
  /** Salary for this period was clipped to the employment start or end date. */
  proratedToEmploymentEnd?: boolean;
};

/**
 * Printable payslip. Earnings sum to gross. Commission clawback is already inside
 * commission. Carry-forward in, PAYE, UIF, and manual amounts are the deductions.
 * Net is the saved pay-run figure. A positive carry-forward out is the shortfall
 * kept for the next run, not a second deduction from this net.
 */
export function renderPayslipHtml(view: PayslipView): string {
  const currency = view.currency || "ZAR";
  const earnings = [view.commission, view.hourly, view.salary, view.tips].reduce(
    (sum, amount) => addMoney(sum, amount),
    0,
  );
  const otherEarnings = subtractMoney(view.gross, earnings);
  const deductions = [view.manual, view.tax, view.uif, view.carryIn].reduce(
    (sum, amount) => addMoney(sum, amount),
    0,
  );
  const recordedNet = computeNetPay({
    grossPay: view.gross,
    manualDeductions: view.manual,
    taxDeduction: view.tax,
    uifContribution: view.uif,
    carryForwardBalance: view.carryIn > 0 ? -view.carryIn : 0,
  }).netPay;
  const netNote =
    Math.abs(recordedNet - view.net) > 0.009
      ? `<p class="note">Net pay is the amount recorded on this pay run.</p>`
      : "";
  const clawbackNote =
    view.clawback > 0
      ? `<p class="note">Commission already includes ${money(view.clawback)} ${escapeHtml(currency)} reversed this period.</p>`
      : "";
  const carryOutNote =
    view.carryOut > 0
      ? `<p class="note">Shortfall carried to the next pay run: ${money(view.carryOut)} ${escapeHtml(currency)}. It is not deducted again from this net pay.</p>`
      : "";
  const notes = view.notes?.trim()
    ? `<p class="note">${escapeHtml(view.notes.trim())}</p>`
    : "";
  const taxTreatment = view.taxTreatment ?? "estimated";
  const engagementNote = describeEngagement({ ...view, taxTreatment });
  const payeLabel = taxTreatment === "estimated" ? "PAYE (estimate)" : "PAYE";
  const uifLabel = taxTreatment === "estimated" ? "UIF (employee)" : "UIF";

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>Payslip — ${escapeHtml(view.staffName)}</title>
<style>
body{font-family:system-ui,sans-serif;padding:24px;color:#111;max-width:720px}
h1{font-size:1.25rem;margin-bottom:0.25rem}
.meta{color:#374151;margin:0 0 8px}
table{width:100%;border-collapse:collapse;margin-top:16px}
td,th{padding:8px;border-bottom:1px solid #e5e7eb;text-align:left}
td.amt,th.amt{text-align:right;font-variant-numeric:tabular-nums}
.total td{font-weight:600}
.note{color:#374151;font-size:0.9rem}
.print{margin-top:16px}
@media print {.print{display:none}}
</style></head><body>
<button class="print" type="button" onclick="window.print()">Print or save as PDF</button>
<h1>Payslip</h1>
<p class="meta">${escapeHtml(view.employerName)}</p>
<p class="meta">${escapeHtml(view.staffName)}</p>
<p class="meta">Period: ${escapeHtml(view.periodStart)} to ${escapeHtml(view.periodEnd)}</p>
<table>
<tr><th>Earnings</th><th class="amt">${escapeHtml(currency)}</th></tr>
<tr><td>Commission</td><td class="amt">${money(view.commission)}</td></tr>
<tr><td>Hourly</td><td class="amt">${money(view.hourly)}</td></tr>
<tr><td>Salary</td><td class="amt">${money(view.salary)}</td></tr>
<tr><td>Tips</td><td class="amt">${money(view.tips)}</td></tr>
${otherEarnings !== 0 ? `<tr><td>Other earnings</td><td class="amt">${money(otherEarnings)}</td></tr>` : ""}
<tr class="total"><td>Gross pay</td><td class="amt">${money(view.gross)}</td></tr>
<tr><th>Deductions</th><th class="amt"></th></tr>
<tr><td>Manual deductions</td><td class="amt">${money(view.manual)}</td></tr>
<tr><td>${payeLabel}</td><td class="amt">${money(view.tax)}</td></tr>
<tr><td>${uifLabel}</td><td class="amt">${money(view.uif)}</td></tr>
<tr><td>Carry-forward from last pay run</td><td class="amt">${money(view.carryIn)}</td></tr>
<tr class="total"><td>Total deductions</td><td class="amt">${money(deductions)}</td></tr>
<tr class="total"><td>Net pay</td><td class="amt">${money(view.net)}</td></tr>
</table>
${engagementNote}
${clawbackNote}
${carryOutNote}
${netNote}
${notes}
</body></html>`;
}

export async function generatePayslipHtml(
  admin: SupabaseClient,
  payRunItemId: string,
): Promise<PayslipPayload | null> {
  const { data: item } = await admin
    .from("provider_pay_run_items")
    .select(
      `
      id, gross_pay, commission_amount, hourly_amount, salary_amount, tips_amount,
      manual_deductions, tax_deduction, uif_contribution,
      commission_clawback, carry_forward_in, carry_forward_out, net_pay, notes,
      provider_pay_runs(pay_period_start, pay_period_end, currency, provider_id),
      provider_staff(id, employment_start_date, employment_end_date, users(full_name))
    `,
    )
    .eq("id", payRunItemId)
    .single();

  if (!item) return null;

  type RunRow = {
    pay_period_start?: string;
    pay_period_end?: string;
    currency?: string;
    provider_id?: string;
  };
  type StaffRow = {
    id?: string;
    employment_start_date?: string | null;
    employment_end_date?: string | null;
    users?: { full_name?: string } | { full_name?: string }[] | null;
  };

  const raw = item as {
    provider_pay_runs?: RunRow | RunRow[] | null;
    provider_staff?: StaffRow | StaffRow[] | null;
    commission_amount?: number;
    hourly_amount?: number;
    salary_amount?: number;
    tips_amount?: number;
    gross_pay?: number;
    manual_deductions?: number;
    tax_deduction?: number;
    uif_contribution?: number;
    commission_clawback?: number;
    carry_forward_in?: number;
    carry_forward_out?: number;
    net_pay?: number;
    notes?: string | null;
  };
  const run = Array.isArray(raw.provider_pay_runs) ? raw.provider_pay_runs[0] : raw.provider_pay_runs;
  const staffRow = Array.isArray(raw.provider_staff) ? raw.provider_staff[0] : raw.provider_staff;
  const users = staffRow?.users;
  const user = Array.isArray(users) ? users[0] : users;

  let employerName = "Employer";
  if (run?.provider_id) {
    const { data: provider } = await admin
      .from("providers")
      .select("business_name")
      .eq("id", run.provider_id)
      .maybeSingle();
    const businessName = (provider as { business_name?: string } | null)?.business_name?.trim();
    if (businessName) employerName = businessName;
  }

  let engagement: PayslipView["engagement"] = "employee";
  let taxTreatment: PayslipView["taxTreatment"] = "estimated";
  let proratedToEmploymentEnd = false;
  const staffId = staffRow?.id;
  const periodEnd = run?.pay_period_end ?? "";
  const periodStart = run?.pay_period_start ?? "";
  if (staffId && run?.provider_id && periodEnd) {
    const country = await getProviderPayrollCountry(admin, run.provider_id);
    const meta = await loadStaffPayrollMetaBatch(admin, run.provider_id, [staffId], periodEnd, country);
    const row = meta.get(staffId);
    if (row) {
      engagement = row.employmentType;
      taxTreatment = resolvePayslipTaxTreatment({
        engagement: row.employmentType,
        statutoryMode: row.statutoryMode,
        tax: Number(raw.tax_deduction ?? 0),
        uif: Number(raw.uif_contribution ?? 0),
        gross: Number(raw.gross_pay ?? 0),
      });
    }
    const employmentStart = staffRow?.employment_start_date ?? "";
    const employmentEnd = staffRow?.employment_end_date ?? "";
    const startedInside =
      Boolean(employmentStart) && employmentStart > periodStart && employmentStart <= periodEnd;
    const endedInside =
      Boolean(employmentEnd) && employmentEnd >= periodStart && employmentEnd < periodEnd;
    if (startedInside || endedInside) proratedToEmploymentEnd = true;
  }
  const taxAmount = Number(raw.tax_deduction ?? 0);
  const uifAmount = Number(raw.uif_contribution ?? 0);

  const html = renderPayslipHtml({
    staffName: user?.full_name?.trim() || "Staff",
    employerName,
    periodStart: run?.pay_period_start ?? "",
    periodEnd: run?.pay_period_end ?? "",
    currency: run?.currency?.trim() || "ZAR",
    commission: Number(raw.commission_amount ?? 0),
    hourly: Number(raw.hourly_amount ?? 0),
    salary: Number(raw.salary_amount ?? 0),
    tips: Number(raw.tips_amount ?? 0),
    gross: Number(raw.gross_pay ?? 0),
    clawback: Number(raw.commission_clawback ?? 0),
    carryIn: Number(raw.carry_forward_in ?? 0),
    manual: Number(raw.manual_deductions ?? 0),
    tax: taxAmount,
    uif: uifAmount,
    net: Number(raw.net_pay ?? 0),
    carryOut: Math.abs(Number(raw.carry_forward_out ?? 0)),
    notes: raw.notes ?? undefined,
    engagement,
    taxTreatment,
    proratedToEmploymentEnd,
  });

  return {
    html,
    filename: `payslip-${payRunItemId.slice(0, 8)}.html`,
  };
}

export function resolvePayslipTaxTreatment(input: {
  engagement: "employee" | "contractor" | "apprentice";
  statutoryMode: "auto" | "manual" | "none";
  tax: number;
  uif: number;
  gross: number;
}): "estimated" | "entered" | "not_calculated" {
  if (input.engagement === "contractor" || input.statutoryMode === "none") {
    return input.tax > 0 || input.uif > 0 ? "entered" : "not_calculated";
  }
  if (input.statutoryMode === "manual") return "entered";
  // A positive gross with no PAYE and no UIF means the statutory step did not run.
  if (input.tax === 0 && input.uif === 0 && input.gross > 0) return "not_calculated";
  return "estimated";
}

function describeEngagement(view: PayslipView): string {
  const engagement = view.engagement ?? "employee";
  const taxTreatment = view.taxTreatment ?? "estimated";
  const prorated = !view.proratedToEmploymentEnd
    ? ""
    : engagement === "contractor" || taxTreatment === "not_calculated"
      ? " Pay for this period is limited to the employment dates."
      : " Salary for this period is limited to the employment dates. PAYE and UIF still apply to that amount.";
  let text = "";
  if (engagement === "contractor") {
    text = `Independent contractor. PAYE and UIF are not calculated. Any PAYE or UIF amount was entered on this pay run.${prorated}`;
  } else if (taxTreatment === "not_calculated") {
    text = `PAYE and UIF were not calculated for this pay run.${prorated}`;
  } else if (engagement === "apprentice") {
    text =
      taxTreatment === "entered"
        ? `Apprentice. PAYE and UIF were entered on this pay run. A learnership allowance is not applied.${prorated}`
        : `Apprentice. PAYE and UIF use the same calculation as an employee. A learnership allowance is not applied. PAYE is an estimate.${prorated}`;
  } else if (taxTreatment === "entered") {
    text = `Employee. PAYE and UIF were entered on this pay run.${prorated}`;
  } else {
    text = `Employee. PAYE is an estimate. UIF is the employee contribution.${prorated}`;
  }
  return `<p class="note">${escapeHtml(text)}</p>`;
}

function money(v: number): string {
  return Number(v || 0).toFixed(2);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
