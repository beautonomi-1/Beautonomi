import { addMoney } from "@beautonomi/utils";
import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  errorResponse,
  getProviderIdForUser,
  handleApiError,
  requireRoleInApi,
  successResponse,
} from "@/lib/supabase/api-helpers";
import { requireProviderReportsAccess } from "@/lib/reports/require-provider-reports-access";
import { requirePaystackVirtualTerminalEnabledForProvider } from "@/lib/payments/paystack-virtual-terminal-feature-gate";
import { getProviderReportContext, reportDateRangeFromParams } from "@/lib/reports/provider-report-utils";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  mergeTerminalPaymentContact,
  TERMINAL_PAYMENT_COLUMNS_WITHOUT_CONTACT,
  viewerMaySeeTerminalPayer,
} from "@/lib/payments/terminal-payment-columns";

export async function GET(request: NextRequest) {
  try {
    const permissionCheck = await requireProviderReportsAccess(request, { reportType: "payments" });
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase, { request });
    if (!providerId) return errorResponse("Provider not found", "PROVIDER_NOT_FOUND", 404);

    const gate = await requirePaystackVirtualTerminalEnabledForProvider(supabase, providerId);
    if (gate) return gate;

    const { searchParams } = new URL(request.url);
    const reportContext = await getProviderReportContext(getSupabaseAdmin(), providerId);
    const { fromDate, toDate, fromYmd, toYmd } = reportDateRangeFromParams(
      searchParams,
      reportContext.timezone,
      { defaultDays: 30 },
    );

    let query = (supabase.from("provider_paystack_terminal_payments") as any)
      .select(
        `
          ${TERMINAL_PAYMENT_COLUMNS_WITHOUT_CONTACT},
          allocations:provider_terminal_payment_allocations(*),
          terminal:provider_paystack_virtual_terminals(id, name, terminal_code)
        `,
      )
      .eq("provider_id", providerId)
      .gte("created_at", fromDate.toISOString())
      .lte("created_at", toDate.toISOString())
      .order("created_at", { ascending: false });

    const { data, error } = await query;
    if (error) throw error;

    const rows = await mergeTerminalPaymentContact(
      data ?? [],
      await viewerMaySeeTerminalPayer(user, request),
    );
    const totals = rows.reduce(
      (acc: Record<string, number>, row: any) => {
        const amount = Number(row.paid_amount ?? 0);
        acc.received = addMoney(acc.received, amount);
        if (["allocated", "provider_confirmed", "split_allocated", "admin_resolved"].includes(row.allocation_status)) {
          acc.allocated = addMoney(acc.allocated, Number(row.allocated_amount ?? amount));
        } else {
          acc.unallocated = addMoney(acc.unallocated, amount);
        }
        if (row.payout_eligibility_status === "held") acc.held = addMoney(acc.held, amount);
        if (row.payout_eligibility_status === "eligible") acc.eligible = addMoney(acc.eligible, amount);
        if (row.allocation_status === "provider_declined") acc.declined = addMoney(acc.declined, amount);
        return acc;
      },
      { received: 0, allocated: 0, unallocated: 0, held: 0, eligible: 0, declined: 0 },
    );

    return successResponse({
      rows,
      totals,
      count: rows.length,
      fromYmd,
      toYmd,
      timezone: reportContext.timezone,
    });
  } catch (error) {
    return handleApiError(error, "Failed to load Paystack Terminal reconciliation");
  }
}
