import { NextRequest } from "next/server";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { getProviderIdForUser } from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { calculatePayRun, type PayPeriodType } from "@/lib/payroll/pay-run-engine";
import {
  assertPayrollEnabledForProvider,
  userCanManagePayroll,
} from "@/lib/payroll/payroll-access";
import { requireManagePayroll } from "@/lib/payroll/require-manage-payroll";
import { payRunItemToInsertRow } from "@/lib/payroll/pay-run-item-rows";
import { z } from "zod";

const createSchema = z
  .object({
    pay_period_start: z.string(),
    pay_period_end: z.string(),
    period_type: z
      .enum(["weekly", "biweekly", "semi_monthly", "monthly", "custom"])
      .optional()
      .default("weekly"),
  })
  .refine(
    (b) => {
      const a = new Date(b.pay_period_start).getTime();
      const e = new Date(b.pay_period_end).getTime();
      return Number.isFinite(a) && Number.isFinite(e) && e >= a;
    },
    { message: "pay_period_end must be on or after pay_period_start" },
  );

/**
 * GET /api/provider/pay-runs
 * List pay runs for the provider (manage payroll only).
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["provider_owner", "provider_staff", "superadmin"],
      request,
    );

    const canManage = await userCanManagePayroll(user.id, request);
    if (!canManage) {
      return successResponse([]);
    }

    const supabaseAdmin = getSupabaseAdmin();

    const providerId = await getProviderIdForUser(user.id, supabaseAdmin);
    if (!providerId) {
      return handleApiError(new Error("Provider not found"), "NOT_FOUND", 404);
    }

    const payrollGateList = await assertPayrollEnabledForProvider(supabaseAdmin, providerId);
    if (payrollGateList.ok === false) {
      return handleApiError(new Error(payrollGateList.message), "PAYROLL_UNAVAILABLE", 403);
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
    const payrollCheck = await requireManagePayroll(request);
    if (!payrollCheck.authorized) {
      return payrollCheck.response!;
    }
    const { user } = payrollCheck;

    const supabaseAdmin = getSupabaseAdmin();

    const providerId = await getProviderIdForUser(user.id, supabaseAdmin);
    if (!providerId) {
      return handleApiError(new Error("Provider not found"), "NOT_FOUND", 404);
    }

    const payrollGate = await assertPayrollEnabledForProvider(supabaseAdmin, providerId);
    if (payrollGate.ok === false) {
      return handleApiError(new Error(payrollGate.message), "PAYROLL_UNAVAILABLE", 403);
    }

    const body = createSchema.parse(await request.json());
    const periodStart = body.pay_period_start;
    const periodEnd = body.pay_period_end;
    const periodType = (body.period_type || "weekly") as PayPeriodType;

    const { data: overlapping } = await supabaseAdmin
      .from("provider_pay_runs")
      .select("id")
      .eq("provider_id", providerId)
      .lte("pay_period_start", body.pay_period_end)
      .gte("pay_period_end", body.pay_period_start)
      .limit(1);

    if (overlapping?.length) {
      return handleApiError(
        new Error(
          "A pay run already exists for an overlapping period. Adjust dates or use the existing run.",
        ),
        "Failed to create pay run",
        "OVERLAPPING_PAY_RUN",
        409,
      );
    }

    const items = await calculatePayRun(
      supabaseAdmin,
      providerId,
      periodStart,
      periodEnd,
      periodType,
    );

    const { data: payRun, error: prError } = await supabaseAdmin
      .from("provider_pay_runs")
      .insert({
        provider_id: providerId,
        pay_period_start: body.pay_period_start,
        pay_period_end: body.pay_period_end,
        period_type: periodType,
        status: "draft",
      })
      .select("id")
      .single();

    if (prError) throw prError;
    if (!payRun?.id) throw new Error("Failed to create pay run");

    const itemsToInsert = items.map((item) => payRunItemToInsertRow(payRun.id, item));

    if (itemsToInsert.length > 0) {
      const { error: itemsError } = await supabaseAdmin
        .from("provider_pay_run_items")
        .insert(itemsToInsert);
      if (itemsError) {
        await supabaseAdmin.from("provider_pay_runs").delete().eq("id", payRun.id);
        throw itemsError;
      }
    }

    return successResponse({ id: payRun.id, items: items.length });
  } catch (error) {
    return handleApiError(error, "Failed to create pay run");
  }
}
