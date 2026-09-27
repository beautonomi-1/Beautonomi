import { NextRequest } from "next/server";
import {
  requireRoleInApi,
  handleApiError,
  getProviderIdForUser,
} from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { assertPayrollEnabledForProvider } from "@/lib/payroll/payroll-access";

/**
 * GET /api/provider/reports/payroll/journal-export?pay_run_id=
 * CSV journal lines: wages expense, PAYE/UIF liabilities, net wages payable.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner"], request);
    const admin = getSupabaseAdmin();
    const providerId = await getProviderIdForUser(user.id, admin, { request });
    if (!providerId) {
      return handleApiError(new Error("Provider not found"), "NOT_FOUND", 404);
    }
    const gate = await assertPayrollEnabledForProvider(admin, providerId);
    if (gate.ok === false) {
      return handleApiError(new Error(gate.message), "FORBIDDEN", 403);
    }

    const payRunId = request.nextUrl.searchParams.get("pay_run_id")?.trim();
    if (!payRunId) {
      return handleApiError(new Error("pay_run_id is required"), "VALIDATION_ERROR", 400);
    }

    const { data: items } = await admin
      .from("provider_pay_run_items")
      .select(
        "gross_pay, tax_deduction, uif_contribution, net_pay, provider_pay_runs!inner(id, provider_id, pay_period_end)",
      )
      .eq("pay_run_id", payRunId);

    const run = (items?.[0] as { provider_pay_runs?: { provider_id?: string; pay_period_end?: string } })
      ?.provider_pay_runs;
    if (!items?.length || run?.provider_id !== providerId) {
      return handleApiError(new Error("Pay run not found"), "NOT_FOUND", 404);
    }

    let gross = 0;
    let paye = 0;
    let uif = 0;
    let net = 0;
    for (const row of items) {
      gross += Number((row as { gross_pay?: number }).gross_pay ?? 0);
      paye += Number((row as { tax_deduction?: number }).tax_deduction ?? 0);
      uif += Number((row as { uif_contribution?: number }).uif_contribution ?? 0);
      net += Number((row as { net_pay?: number }).net_pay ?? 0);
    }

    const date = run?.pay_period_end ?? "";
    const lines = [
      "account,debit,credit,memo",
      `Wages expense,${gross.toFixed(2)},0,Pay run ${date}`,
      `PAYE payable,0,${paye.toFixed(2)},Pay run ${date}`,
      `UIF payable,0,${uif.toFixed(2)},Pay run ${date}`,
      `Net wages payable,0,${net.toFixed(2)},Pay run ${date}`,
    ].join("\n");

    return new Response(`${lines}\n`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="payroll-journal-${payRunId.slice(0, 8)}.csv"`,
      },
    });
  } catch (error) {
    return handleApiError(error, "Failed to export payroll journal");
  }
}
