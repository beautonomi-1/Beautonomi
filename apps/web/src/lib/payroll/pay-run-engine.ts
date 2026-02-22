import type { SupabaseClient } from "@supabase/supabase-js";
import { calculateStaffCommission } from "./commission-calculator";
import { getTipsByStaff } from "./tips-helper";

export interface PayRunItem {
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
}

export type PayPeriodType = "weekly" | "monthly";

/**
 * Calculate pay run for all active staff of a provider.
 * Combines commission + hourly (from time cards) + salary (prorated) + tips.
 */
export async function calculatePayRun(
  supabaseAdmin: SupabaseClient,
  providerId: string,
  periodStart: Date,
  periodEnd: Date,
  periodType: PayPeriodType = "weekly"
): Promise<PayRunItem[]> {
  const results: PayRunItem[] = [];

  const { data: staffMembers } = await supabaseAdmin
    .from("provider_staff")
    .select("id, user_id, commission_enabled, hourly_rate, salary, tips_enabled, users(full_name)")
    .eq("provider_id", providerId)
    .eq("is_active", true);

  if (!staffMembers?.length) return results;

  const periodStartStr = periodStart.toISOString().split("T")[0];
  const periodEndStr = periodEnd.toISOString().split("T")[0];

  const { data: timeCards } = await supabaseAdmin
    .from("staff_time_cards")
    .select("staff_id, total_hours")
    .in("staff_id", staffMembers.map((s: any) => s.id))
    .gte("date", periodStartStr)
    .lte("date", periodEndStr)
    .not("total_hours", "is", null);

  const hoursByStaff = new Map<string, number>();
  for (const tc of timeCards || []) {
    const s = (tc as any).staff_id;
    hoursByStaff.set(s, (hoursByStaff.get(s) || 0) + Number((tc as any).total_hours || 0));
  }

  const tipsByStaff = await getTipsByStaff(supabaseAdmin, providerId, periodStart, periodEnd);

  for (const staff of staffMembers) {
    const commission = await calculateStaffCommission(
      supabaseAdmin,
      providerId,
      staff.id,
      periodStart,
      periodEnd
    );

    const hours = hoursByStaff.get(staff.id) || 0;
    const hourlyRate = Number(staff.hourly_rate || 0);
    const salary = Number(staff.salary || 0);
    const commissionAmount = staff.commission_enabled ? commission.totalCommission : 0;
    const hourlyAmount = hours * hourlyRate;
    const salaryAmount =
      periodType === "weekly"
        ? salary / 4
        : periodType === "monthly"
          ? salary
          : salary / 4;
    const tipsAmount = staff.tips_enabled ? (tipsByStaff.get(staff.id) || 0) : 0;

    const grossPay = commissionAmount + hourlyAmount + (salary > 0 ? salaryAmount : 0) + tipsAmount;
    const manualDeductions = 0;
    const taxDeduction = 0;
    const uifContribution = 0;
    const netPay = Math.max(0, grossPay - manualDeductions - taxDeduction - uifContribution);

    results.push({
      staffId: staff.id,
      staffName: (staff.users as any)?.full_name || "Unknown",
      grossPay,
      commissionAmount,
      hourlyAmount,
      salaryAmount: salary > 0 ? salaryAmount : 0,
      tipsAmount,
      manualDeductions,
      taxDeduction,
      uifContribution,
      netPay,
    });
  }

  return results;
}
