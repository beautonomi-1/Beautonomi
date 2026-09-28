import type { SupabaseClient } from "@supabase/supabase-js";

export type PayslipPayload = {
  html: string;
  filename: string;
};

/**
 * Build a printable payslip HTML document (BCEA-oriented fields; pack can extend via payslip_requirements).
 */
export async function generatePayslipHtml(
  admin: SupabaseClient,
  payRunItemId: string,
): Promise<PayslipPayload | null> {
  const { data: item } = await admin
    .from("provider_pay_run_items")
    .select(
      `
      id, gross_pay, commission_amount, hourly_amount, salary_amount, tips_amount,
      manual_deductions, tax_deduction, uif_contribution, net_pay, notes,
      provider_pay_runs(pay_period_start, pay_period_end, currency, provider_id),
      provider_staff(id, users(full_name))
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
  type StaffRow = { users?: { full_name?: string } | { full_name?: string }[] | null };

  const raw = item as {
    provider_pay_runs?: RunRow | RunRow[] | null;
    provider_staff?: StaffRow | StaffRow[] | null;
  };
  const run = Array.isArray(raw.provider_pay_runs)
    ? raw.provider_pay_runs[0]
    : raw.provider_pay_runs;
  const staffRow = Array.isArray(raw.provider_staff)
    ? raw.provider_staff[0]
    : raw.provider_staff;
  const users = staffRow?.users;
  const user = Array.isArray(users) ? users[0] : users;
  const name = user?.full_name ?? "Staff";
  const currency = run?.currency ?? "ZAR";

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>Payslip</title>
<style>
body{font-family:system-ui,sans-serif;padding:24px;color:#111}
h1{font-size:1.25rem} table{width:100%;border-collapse:collapse;margin-top:16px}
td,th{padding:8px;border-bottom:1px solid #e5e7eb;text-align:left}
.total{font-weight:600}
</style></head><body>
<h1>Payslip — ${escapeHtml(name)}</h1>
<p>Period: ${escapeHtml(run?.pay_period_start ?? "")} to ${escapeHtml(run?.pay_period_end ?? "")}</p>
<table>
<tr><th>Earnings</th><th>${escapeHtml(currency)}</th></tr>
<tr><td>Commission</td><td>${num(item.commission_amount)}</td></tr>
<tr><td>Hourly</td><td>${num(item.hourly_amount)}</td></tr>
<tr><td>Salary</td><td>${num(item.salary_amount)}</td></tr>
<tr><td>Tips</td><td>${num(item.tips_amount)}</td></tr>
<tr class="total"><td>Gross pay</td><td>${num(item.gross_pay)}</td></tr>
<tr><th>Deductions</th><th></th></tr>
<tr><td>Manual</td><td>${num(item.manual_deductions)}</td></tr>
<tr><td>PAYE (estimate)</td><td>${num(item.tax_deduction)}</td></tr>
<tr><td>UIF</td><td>${num(item.uif_contribution)}</td></tr>
<tr class="total"><td>Net pay</td><td>${num(item.net_pay)}</td></tr>
</table>
${item.notes ? `<p><em>${escapeHtml(String(item.notes))}</em></p>` : ""}
</body></html>`;

  return {
    html,
    filename: `payslip-${payRunItemId.slice(0, 8)}.html`,
  };
}

function num(v: unknown): string {
  return Number(v ?? 0).toFixed(2);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
