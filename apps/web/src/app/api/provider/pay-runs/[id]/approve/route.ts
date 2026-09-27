import { NextRequest } from "next/server";
import {
  requireRoleInApi,
  successResponse,
  notFoundResponse,
  handleApiError,
  getProviderIdForUser,
} from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { notifyPayRunStaff } from "@/lib/notifications/notify-staff-event";
import { payrollDisabledMessage } from "@/lib/payroll/payroll-access";

/**
 * POST /api/provider/pay-runs/[id]/approve
 * Approve a draft pay run
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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

    const { data: payRun, error: fetchError } = await supabaseAdmin
      .from("provider_pay_runs")
      .select("id, status, pay_period_start, pay_period_end")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (fetchError || !payRun) return notFoundResponse("Pay run not found");
    if (payRun.status !== "draft") {
      return handleApiError(
        new Error("Only draft pay runs can be approved"),
        "INVALID_STATE",
        400
      );
    }

    const { error: updateError } = await supabaseAdmin
      .from("provider_pay_runs")
      .update({ status: "approved", approved_at: new Date().toISOString() })
      .eq("id", id);

    if (updateError) throw updateError;

    const { from, to } = await import("@/lib/payroll/period-bounds").then((m) =>
      import("@/lib/payroll/provider-payroll-context").then(async (ctx) => {
        const tz = await ctx.getProviderPayrollTimezone(supabaseAdmin, providerId);
        return m.resolvePayPeriodBounds(
          payRun.pay_period_start as string,
          payRun.pay_period_end as string,
          tz,
        );
      }),
    );

    await supabaseAdmin
      .from("staff_earnings_lines")
      .update({ pay_run_id: id })
      .eq("provider_id", providerId)
      .gte("created_at", from.toISOString())
      .lte("created_at", to.toISOString())
      .is("pay_run_id", null);

    void notifyPayRunStaff(supabaseAdmin, id, "staff_pay_run_approved", {
      periodStart: payRun.pay_period_start as string,
      periodEnd: payRun.pay_period_end as string,
    }).catch((err) => console.warn("[pay-runs/approve] notify failed:", err));

    return successResponse({ status: "approved" });
  } catch (error) {
    return handleApiError(error, "Failed to approve pay run");
  }
}
