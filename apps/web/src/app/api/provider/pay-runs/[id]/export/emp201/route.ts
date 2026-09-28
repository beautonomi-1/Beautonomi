import { NextRequest } from "next/server";
import {
  requireRoleInApi,
  notFoundResponse,
  handleApiError,
  getProviderIdForUser,
} from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { assertPayrollEnabledForProvider } from "@/lib/payroll/payroll-access";

/**
 * GET /api/provider/pay-runs/[id]/export/emp201
 * Monthly EMP201-style CSV totals (PAYE, UIF employee, SDL employer estimate) for accountants.
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

    const gate = await assertPayrollEnabledForProvider(admin, providerId);
    if (gate.ok === false) {
      return handleApiError(new Error(gate.message), "FORBIDDEN", 403);
    }

    const { data: payRun } = await admin
      .from("provider_pay_runs")
      .select("id, pay_period_start, pay_period_end, status, currency")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (!payRun) return notFoundResponse("Pay run not found");

    const { data: items } = await admin
      .from("provider_pay_run_items")
      .select("id, tax_deduction, uif_contribution, gross_pay, net_pay")
      .eq("pay_run_id", id);

    let paye = 0;
    let uif = 0;
    let gross = 0;
    for (const row of items ?? []) {
      paye += Number((row as { tax_deduction?: number }).tax_deduction ?? 0);
      uif += Number((row as { uif_contribution?: number }).uif_contribution ?? 0);
      gross += Number((row as { gross_pay?: number }).gross_pay ?? 0);
    }

    let sdl = 0;
    const itemIds = (items ?? []).map((i: { id: string }) => i.id);
    if (itemIds.length > 0) {
      const { data: sdlLines } = await admin
        .from("provider_pay_run_item_lines")
        .select("amount, code")
        .eq("code", "sdl_employer")
        .in("pay_run_item_id", itemIds);
      for (const line of sdlLines ?? []) {
        sdl += Number((line as { amount?: number }).amount ?? 0);
      }
    }
    if (sdl === 0 && gross > 0) {
      const { data: sdlRule } = await admin
        .from("payroll_rule_sets")
        .select("data")
        .eq("jurisdiction_code", "ZA")
        .eq("rule_type", "employer_levies")
        .eq("status", "published")
        .lte("effective_from", payRun.pay_period_end as string)
        .limit(1)
        .maybeSingle();
      const data = (sdlRule as { data?: { rate?: number; annualThreshold?: number } } | null)?.data;
      const threshold = Number(data?.annualThreshold ?? 500_000);
      const rate = Number(data?.rate ?? 0.01);
      const periodEnd = payRun.pay_period_end as string;
      const periodStart = payRun.pay_period_start as string;
      const days =
        (new Date(`${periodEnd}T12:00:00Z`).getTime() -
          new Date(`${periodStart}T12:00:00Z`).getTime()) /
          86400000 +
        1;
      const periodsPerYear = days <= 10 ? 52 : days <= 16 ? 26 : 12;
      const estimatedAnnual = gross * periodsPerYear;
      if (estimatedAnnual > threshold) {
        sdl = Math.round(gross * rate * 100) / 100;
      }
    }

    const period = `${payRun.pay_period_start}_${payRun.pay_period_end}`;
    const header = "period_start,period_end,currency,total_gross,paye_total,uif_employee_total,sdl_employer_total\n";
    const row = [
      payRun.pay_period_start,
      payRun.pay_period_end,
      payRun.currency ?? "ZAR",
      gross.toFixed(2),
      paye.toFixed(2),
      uif.toFixed(2),
      sdl.toFixed(2),
    ].join(",");
    const csv = header + row + "\n";

    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="emp201-${period}.csv"`,
      },
    });
  } catch (error) {
    return handleApiError(error, "Failed to export EMP201");
  }
}
