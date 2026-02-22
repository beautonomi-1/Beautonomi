import { NextRequest } from "next/server";
import {
  requireRoleInApi,
  getProviderIdForUser,
  notFoundResponse,
  successResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { createClient } from "@supabase/supabase-js";

/**
 * GET /api/provider/pay-runs/my-earnings
 * For staff: list pay runs where the current user has an item (pay stubs)
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff", "superadmin"], request);

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const providerId = await getProviderIdForUser(user.id, supabaseAdmin);

    if (!providerId) return notFoundResponse("Provider not found");


    // Get staff record for current user
    const { data: staff } = await supabaseAdmin
      .from("provider_staff")
      .select("id")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();

    if (!staff) {
      return successResponse([]);
    }

    const { data: items } = await supabaseAdmin
      .from("provider_pay_run_items")
      .select("id, pay_run_id, gross_pay, commission_amount, hourly_amount, salary_amount, tips_amount, manual_deductions, tax_deduction, uif_contribution, net_pay, notes")
      .eq("staff_id", staff.id)
      .limit(50);

    const payRunIds = [...new Set((items || []).map((i: any) => i.pay_run_id).filter(Boolean))];
    const payRunMap = new Map<string, any>();
    if (payRunIds.length > 0) {
      const { data: payRuns } = await supabaseAdmin
        .from("provider_pay_runs")
        .select("id, pay_period_start, pay_period_end, status, created_at, approved_at")
        .in("id", payRunIds);
      for (const pr of payRuns || []) {
        payRunMap.set((pr as any).id, pr);
      }
    }

    const payStubs = (items || [])
      .map((i: any) => {
        const pr = payRunMap.get(i.pay_run_id);
        if (!pr) return null;
        return {
        pay_run_id: pr?.id,
        pay_period_start: pr?.pay_period_start,
        pay_period_end: pr?.pay_period_end,
        status: pr?.status,
        created_at: pr?.created_at,
        gross_pay: i.gross_pay,
        commission_amount: i.commission_amount,
        hourly_amount: i.hourly_amount,
        salary_amount: i.salary_amount,
        tips_amount: i.tips_amount,
        manual_deductions: i.manual_deductions,
        tax_deduction: i.tax_deduction,
        uif_contribution: i.uif_contribution,
        net_pay: i.net_pay,
        notes: i.notes,
      };
    })
      .filter(Boolean)
      .sort((a: any, b: any) => new Date(b.pay_period_end).getTime() - new Date(a.pay_period_end).getTime())
      .slice(0, 24);

    return successResponse(payStubs);
  } catch (error) {
    return handleApiError(error, "Failed to load my earnings");
  }
}
