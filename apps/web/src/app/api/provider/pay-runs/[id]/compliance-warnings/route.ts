import { NextRequest } from "next/server";
import {
  requireRoleInApi,
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
} from "@/lib/payroll/compliance-guards";
import { loadStaffPayrollMetaBatch } from "@/lib/payroll/resolve-staff-payroll-meta";
import { payrollDisabledMessage } from "@/lib/payroll/payroll-access";

/**
 * GET /api/provider/pay-runs/[id]/compliance-warnings
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireRoleInApi(["provider_owner"], request);
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
      .select("pay_period_end")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();
    if (!payRun) return notFoundResponse("Pay run not found");

    const payDate = payRun.pay_period_end as string;
    const { data: items } = await admin
      .from("provider_pay_run_items")
      .select("staff_id, gross_pay, hourly_amount, hourly_rate:provider_staff(hourly_rate)")
      .eq("pay_run_id", id);

    const { data: providerRow } = await admin
      .from("providers")
      .select("country_code")
      .eq("id", providerId)
      .maybeSingle();
    const country = (providerRow as { country_code?: string | null })?.country_code?.toUpperCase() ?? null;

    const staffIds = (items ?? []).map((i: { staff_id: string }) => i.staff_id);
    const meta = await loadStaffPayrollMetaBatch(admin, providerId, staffIds, payDate, country);

    const warnings: Array<{ staffId: string; warnings: ReturnType<typeof checkMinimumWage>[] }> = [];

    for (const item of items ?? []) {
      const sid = (item as { staff_id: string }).staff_id;
      const m = meta.get(sid);
      const code = m?.jurisdictionCode ?? country;
      if (!code) continue;
      const rules = await loadPublishedRuleSets(admin, code, payDate);
      const byType = new Map(rules.map((r) => [r.rule_type, r]));
      const gross = Number((item as { gross_pay?: number }).gross_pay ?? 0);
      const hourlyPay = Number((item as { hourly_amount?: number }).hourly_amount ?? 0);
      const hourlyRate = Number(
        (item as { hourly_rate?: { hourly_rate?: number } }).hourly_rate?.hourly_rate ?? 0,
      );
      const hours = hourlyRate > 0 ? hourlyPay / hourlyRate : 0;

      const w: NonNullable<ReturnType<typeof checkMinimumWage>>[] = [];
      const mw = checkMinimumWage(gross, hours, byType.get("minimum_wage"));
      if (mw) w.push(mw);
      // tips_policy on pay plan is loaded in meta when extended; skip inherit-only checks here.
      const contractor = checkContractorClassification(m?.employmentType ?? "employee", byType.get("contractor_rules"));
      if (contractor) w.push(contractor);
      if (w.length) warnings.push({ staffId: sid, warnings: w });
    }

    return successResponse({ warnings });
  } catch (error) {
    return handleApiError(error, "Failed to load compliance warnings");
  }
}
