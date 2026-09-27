import { NextRequest } from "next/server";
import {
  requireRoleInApi,
  notFoundResponse,
  handleApiError,
  getProviderIdForUser,
} from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { generatePayslipHtml } from "@/lib/payroll/generate-payslip";
import { payrollDisabledMessage } from "@/lib/payroll/payroll-access";

/**
 * GET /api/provider/pay-runs/items/[itemId]/payslip
 * Download printable payslip (HTML; print to PDF in browser).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ itemId: string }> },
) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const { itemId } = await params;
    const admin = getSupabaseAdmin();
    const providerId = await getProviderIdForUser(user.id, admin, { request });
    if (!providerId) return notFoundResponse("Provider not found");
    const payrollBlocked = await payrollDisabledMessage(admin, providerId);
    if (payrollBlocked) {
      return handleApiError(new Error(payrollBlocked), "PAYROLL_UNAVAILABLE", 403);
    }

    const { data: item } = await admin
      .from("provider_pay_run_items")
      .select("id, staff_id, provider_pay_runs!inner(provider_id, status)")
      .eq("id", itemId)
      .single();

    const run = (item as { provider_pay_runs?: { provider_id?: string; status?: string } })
      ?.provider_pay_runs;
    if (!item || run?.provider_id !== providerId) {
      return notFoundResponse("Pay run item not found");
    }
    if (run.status === "draft") {
      return handleApiError(new Error("Payslips are available after approval"), "INVALID_STATE", 400);
    }

    if (user.role === "provider_staff") {
      const { data: staff } = await admin
        .from("provider_staff")
        .select("id")
        .eq("user_id", user.id)
        .eq("provider_id", providerId)
        .maybeSingle();
      if (!staff || staff.id !== (item as { staff_id: string }).staff_id) {
        return notFoundResponse("Pay run item not found");
      }
    }

    const doc = await generatePayslipHtml(admin, itemId);
    if (!doc) return notFoundResponse("Pay run item not found");

    return new Response(doc.html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `inline; filename="${doc.filename}"`,
      },
    });
  } catch (error) {
    return handleApiError(error, "Failed to generate payslip");
  }
}
