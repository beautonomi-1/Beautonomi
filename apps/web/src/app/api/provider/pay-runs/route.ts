import { NextRequest } from "next/server";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { getProviderIdForUser } from "@/lib/supabase/api-helpers";
import { createClient } from "@supabase/supabase-js";
import { calculatePayRun } from "@/lib/payroll/pay-run-engine";
import { z } from "zod";

const createSchema = z.object({
  pay_period_start: z.string(),
  pay_period_end: z.string(),
  period_type: z.enum(["weekly", "monthly"]).optional().default("weekly"),
});

/**
 * GET /api/provider/pay-runs
 * List pay runs for the provider
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
    if (!providerId) {
      return handleApiError(new Error("Provider not found"), "NOT_FOUND", 404);
    }

    const { data: payRuns, error } = await supabaseAdmin
      .from("provider_pay_runs")
      .select(`
        id,
        pay_period_start,
        pay_period_end,
        status,
        created_at,
        approved_at
      `)
      .eq("provider_id", providerId)
      .order("pay_period_start", { ascending: false })
      .limit(50);

    if (error) throw error;

    return successResponse(payRuns || []);
  } catch (error) {
    return handleApiError(error, "Failed to list pay runs");
  }
}

/**
 * POST /api/provider/pay-runs
 * Create a draft pay run
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner"], request);

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const providerId = await getProviderIdForUser(user.id, supabaseAdmin);
    if (!providerId) {
      return handleApiError(new Error("Provider not found"), "NOT_FOUND", 404);
    }

    const body = createSchema.parse(await request.json());
    const periodStart = new Date(body.pay_period_start);
    const periodEnd = new Date(body.pay_period_end);
    const periodType = body.period_type || "weekly";

    const items = await calculatePayRun(
      supabaseAdmin,
      providerId,
      periodStart,
      periodEnd,
      periodType
    );

    const { data: payRun, error: prError } = await supabaseAdmin
      .from("provider_pay_runs")
      .insert({
        provider_id: providerId,
        pay_period_start: body.pay_period_start,
        pay_period_end: body.pay_period_end,
        status: "draft",
      })
      .select("id")
      .single();

    if (prError) throw prError;
    if (!payRun?.id) throw new Error("Failed to create pay run");

    const itemsToInsert = items.map((item) => ({
      pay_run_id: payRun.id,
      staff_id: item.staffId,
      gross_pay: item.grossPay,
      commission_amount: item.commissionAmount,
      hourly_amount: item.hourlyAmount,
      salary_amount: item.salaryAmount,
      tips_amount: item.tipsAmount,
      manual_deductions: item.manualDeductions,
      tax_deduction: item.taxDeduction,
      uif_contribution: item.uifContribution,
      net_pay: item.netPay,
    }));

    if (itemsToInsert.length > 0) {
      const { error: itemsError } = await supabaseAdmin
        .from("provider_pay_run_items")
        .insert(itemsToInsert);
      if (itemsError) throw itemsError;
    }

    return successResponse({ id: payRun.id, items: items.length });
  } catch (error) {
    return handleApiError(error, "Failed to create pay run");
  }
}
