import { NextRequest } from "next/server";
import {
  successResponse,
  notFoundResponse,
  handleApiError,
  getProviderIdForUser,
} from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { loadPublishedRuleSets } from "@/lib/payroll/jurisdictions/resolve-statutory";
import {
  checkContractorClassification,
  checkMinimumWage,
  checkTipsPolicy,
} from "@/lib/payroll/compliance-guards";
import { loadStaffPayrollMetaBatch } from "@/lib/payroll/resolve-staff-payroll-meta";
import { payrollDisabledMessage } from "@/lib/payroll/payroll-access";
import { requireManagePayroll } from "@/lib/payroll/require-manage-payroll";

/**
 * GET /api/provider/pay-runs/[id]/compliance-warnings
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const payrollCheck = await requireManagePayroll(request);
    if (!payrollCheck.authorized) {
      return payrollCheck.response!;
    }
    const { user } = payrollCheck;
    const { id } = await params;
    const admin = getSupabaseAdmin();
    const providerId = await getProviderIdForUser(user.id, admin, { request });
    if (!providerId) return notFoundResponse("Provider not found");
    const payrollBlocked = await payrollDisabledMessage(admin, providerId);
    if (payrollBlocked) {
      return handleApiError(new Error(payrollBlocked), "PAYROLL_UNAVAILABLE", 403);
    }

    const { data: payRun } = await admin
      .from("provider_pay_runs")
      .select("pay_period_start, pay_period_end")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();
    if (!payRun) return notFoundResponse("Pay run not found");

    const payDate = payRun.pay_period_end as string;
    const periodStart = payRun.pay_period_start as string;
    const periodEnd = payRun.pay_period_end as string;
    const { data: items } = await admin
      .from("provider_pay_run_items")
      .select("staff_id, gross_pay, hourly_amount")
      .eq("pay_run_id", id);

    const { data: providerRow } = await admin
      .from("providers")
      .select("country_code")
      .eq("id", providerId)
      .maybeSingle();
    const country = (providerRow as { country_code?: string | null })?.country_code?.toUpperCase() ?? null;

    const staffIds = (items ?? []).map((i: { staff_id: string }) => i.staff_id);
    const meta = await loadStaffPayrollMetaBatch(admin, providerId, staffIds, payDate, country);

    const { data: planRows } = await admin
      .from("staff_pay_plans")
      .select("staff_id, tips_policy")
      .eq("provider_id", providerId)
      .in("staff_id", staffIds)
      .lte("effective_from", payDate)
      .or(`effective_to.is.null,effective_to.gte.${payDate}`);

    const tipsPolicyByStaff = new Map<string, string | null>();
    for (const p of planRows ?? []) {
      const sid = (p as { staff_id: string }).staff_id;
      if (!tipsPolicyByStaff.has(sid)) {
        tipsPolicyByStaff.set(sid, (p as { tips_policy?: string | null }).tips_policy ?? null);
      }
    }

    const { data: timeCards } = await admin
      .from("staff_time_cards")
      .select("staff_id, total_hours")
      .in("staff_id", staffIds)
      .gte("date", periodStart)
      .lte("date", periodEnd)
      .not("total_hours", "is", null);

    const hoursByStaff = new Map<string, number>();
    for (const tc of timeCards ?? []) {
      const sid = (tc as { staff_id: string }).staff_id;
      hoursByStaff.set(
        sid,
        (hoursByStaff.get(sid) ?? 0) + Number((tc as { total_hours?: number }).total_hours ?? 0),
      );
    }

    const warnings: Array<{ staffId: string; warnings: ReturnType<typeof checkMinimumWage>[] }> =
      [];

    for (const item of items ?? []) {
      const sid = (item as { staff_id: string }).staff_id;
      const m = meta.get(sid);
      const code = m?.jurisdictionCode ?? country;
      if (!code) continue;
      const rules = await loadPublishedRuleSets(admin, code, payDate);
      const byType = new Map(rules.map((r) => [r.rule_type, r]));
      const gross = Number((item as { gross_pay?: number }).gross_pay ?? 0);
      const hours = hoursByStaff.get(sid) ?? 0;

      const w: NonNullable<ReturnType<typeof checkMinimumWage>>[] = [];
      const mw = checkMinimumWage(gross, hours, byType.get("minimum_wage"));
      if (mw) w.push(mw);
      const tips = checkTipsPolicy(tipsPolicyByStaff.get(sid), byType.get("tips_law"));
      if (tips) w.push(tips);
      const contractor = checkContractorClassification(
        m?.employmentType ?? "employee",
        byType.get("contractor_rules"),
      );
      if (contractor) w.push(contractor);
      if (w.length) warnings.push({ staffId: sid, warnings: w });
    }

    return successResponse({ warnings });
  } catch (error) {
    return handleApiError(error, "Failed to load compliance warnings");
  }
}
