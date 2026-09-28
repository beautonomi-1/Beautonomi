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
 * GET /api/provider/pay-runs/[id]/compare
 * Side-by-side legacy vs payroll_v2 calculation for rollout (draft runs only).
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
      .select("id, status, pay_period_start, pay_period_end, period_type")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();
    if (!payRun || payRun.status !== "draft") {
      return handleApiError(new Error("Comparison is only available for draft pay runs"), "INVALID_STATE", 400);
    }

    const periodType = (payRun as { period_type?: string }).period_type ?? "weekly";
    const start = payRun.pay_period_start as string;
    const end = payRun.pay_period_end as string;

    const { data: settings } = await admin
      .from("provider_settings")
      .select("payroll_v2_enabled")
      .eq("provider_id", providerId)
      .maybeSingle();
    const v2On = (settings as { payroll_v2_enabled?: boolean } | null)?.payroll_v2_enabled === true;

    const withV2 = await calculatePayRun(admin, providerId, start, end, periodType as "weekly" | "monthly", {
      forcePayrollV2: true,
    });
    const legacy = await calculatePayRun(admin, providerId, start, end, periodType as "weekly" | "monthly", {
      forcePayrollV2: false,
    });

    const byStaffV2 = new Map(withV2.map((i) => [i.staffId, i]));
    const diffs = legacy.map((leg) => {
      const neu = byStaffV2.get(leg.staffId);
      return {
        staffId: leg.staffId,
        staffName: leg.staffName,
        legacyNet: leg.netPay,
        v2Net: neu?.netPay ?? null,
        delta: neu != null ? Math.round((neu.netPay - leg.netPay) * 100) / 100 : null,
      };
    });

    const snapshot = { generatedAt: new Date().toISOString(), v2Enabled: v2On, diffs };
    await admin.from("provider_pay_runs").update({ comparison_snapshot: snapshot }).eq("id", id);

    return successResponse(snapshot);
  } catch (error) {
    return handleApiError(error, "Failed to compare pay run");
  }
}
