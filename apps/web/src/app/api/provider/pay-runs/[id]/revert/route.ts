import { NextRequest } from "next/server";
import {
  requireRoleInApi,
  successResponse,
  notFoundResponse,
  handleApiError,
  getProviderIdForUser,
} from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { payrollDisabledMessage } from "@/lib/payroll/payroll-access";

/**
 * POST /api/provider/pay-runs/[id]/revert
 * Owner-only: move an approved pay run back to draft and unlock earnings lines.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireRoleInApi(["provider_owner"], request);
    const { id } = await params;
    const supabaseAdmin = getSupabaseAdmin();
    const providerId = await getProviderIdForUser(user.id, supabaseAdmin, { request });
    if (!providerId) return notFoundResponse("Provider not found");
    const payrollBlocked = await payrollDisabledMessage(supabaseAdmin, providerId);
    if (payrollBlocked) {
      return handleApiError(new Error(payrollBlocked), "PAYROLL_UNAVAILABLE", 403);
    }

    const { data: payRun } = await supabaseAdmin
      .from("provider_pay_runs")
      .select("id, status")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (!payRun) return notFoundResponse("Pay run not found");
    if (payRun.status !== "approved") {
      return handleApiError(
        new Error("Only approved pay runs can be reverted to draft"),
        "INVALID_STATE",
        400,
      );
    }

    await supabaseAdmin
      .from("staff_earnings_lines")
      .update({ pay_run_id: null })
      .eq("provider_id", providerId)
      .eq("pay_run_id", id);

    const { error } = await supabaseAdmin
      .from("provider_pay_runs")
      .update({
        status: "draft",
        approved_at: null,
      })
      .eq("id", id);

    if (error) throw error;

    return successResponse({ status: "draft" });
  } catch (error) {
    return handleApiError(error, "Failed to revert pay run");
  }
}
