import { NextRequest } from "next/server";
import {
  requireRoleInApi,
  successResponse,
  notFoundResponse,
  handleApiError,
  getProviderIdForUser,
} from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { calculatePayRun } from "@/lib/payroll/pay-run-engine";
import { payrollDisabledMessage } from "@/lib/payroll/payroll-access";

/**
 * POST /api/provider/pay-runs/[id]/recalculate
 * Rebuild draft pay run items from current data (preserves manual deductions on items).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireRoleInApi(["provider_owner"], request);
    const { id } = await params;
    const supabaseAdmin = getSupabaseAdmin();
    const providerId = await getProviderIdForUser(user.id, supabaseAdmin);
    if (!providerId) return notFoundResponse("Provider not found");
    const payrollBlocked = await payrollDisabledMessage(supabaseAdmin, providerId);
    if (payrollBlocked) {
      return handleApiError(new Error(payrollBlocked), "PAYROLL_UNAVAILABLE", 403);
    }

    const { data: payRun } = await supabaseAdmin
      .from("provider_pay_runs")
      .select("id, status, pay_period_start, pay_period_end, period_type")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (!payRun || payRun.status !== "draft") {
      return handleApiError(new Error("Only draft pay runs can be recalculated"), "INVALID_STATE", 400);
    }

    const { data: existingItems } = await supabaseAdmin
      .from("provider_pay_run_items")
      .select("staff_id, manual_deductions, tax_deduction, uif_contribution, notes")
      .eq("pay_run_id", id);

    const manualByStaff = new Map(
      (existingItems ?? []).map((i: Record<string, unknown>) => [
        i.staff_id as string,
        i,
      ]),
    );

    const periodType = (payRun as { period_type?: string }).period_type ?? "weekly";
    const items = await calculatePayRun(
      supabaseAdmin,
      providerId,
      payRun.pay_period_start as string,
      payRun.pay_period_end as string,
      periodType as "weekly" | "monthly",
    );

    await supabaseAdmin.from("provider_pay_run_items").delete().eq("pay_run_id", id);

    const rows = items.map((item) => {
      const manual = manualByStaff.get(item.staffId) as Record<string, unknown> | undefined;
      const m = Number(manual?.manual_deductions ?? 0);
      const t = Number(manual?.tax_deduction ?? item.taxDeduction ?? 0);
      const u = Number(manual?.uif_contribution ?? item.uifContribution ?? 0);
      const net = Math.max(0, item.grossPay - m - t - u);
      return {
        pay_run_id: id,
        staff_id: item.staffId,
        gross_pay: item.grossPay,
        commission_amount: item.commissionAmount,
        hourly_amount: item.hourlyAmount,
        salary_amount: item.salaryAmount,
        tips_amount: item.tipsAmount,
        manual_deductions: m,
        tax_deduction: t,
        uif_contribution: u,
        net_pay: net,
        notes: (manual?.notes as string | null) ?? null,
      };
    });

    if (rows.length > 0) {
      const { error } = await supabaseAdmin.from("provider_pay_run_items").insert(rows);
      if (error) throw error;
    }

    return successResponse({ recalculated: rows.length });
  } catch (error) {
    return handleApiError(error, "Failed to recalculate pay run");
  }
}
