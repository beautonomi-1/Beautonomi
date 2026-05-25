import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  errorResponse,
  getProviderIdForUser,
  handleApiError,
  requireRoleInApi,
  successResponse,
} from "@/lib/supabase/api-helpers";
import { requirePaystackVirtualTerminalEnabledForProvider } from "@/lib/payments/paystack-virtual-terminal-feature-gate";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase, { request });
    if (!providerId) return errorResponse("Provider not found", "PROVIDER_NOT_FOUND", 404);

    const gate = await requirePaystackVirtualTerminalEnabledForProvider(supabase, providerId);
    if (gate) return gate;

    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    let query = (supabase.from("provider_paystack_terminal_payments") as any)
      .select(
        `
          *,
          allocations:provider_terminal_payment_allocations(*),
          terminal:provider_paystack_virtual_terminals(id, name, terminal_code)
        `,
      )
      .eq("provider_id", providerId)
      .order("created_at", { ascending: false });

    if (from) query = query.gte("created_at", from);
    if (to) query = query.lte("created_at", to);

    const { data, error } = await query;
    if (error) throw error;

    const rows = data ?? [];
    const totals = rows.reduce(
      (acc: Record<string, number>, row: any) => {
        const amount = Number(row.paid_amount ?? 0);
        acc.received += amount;
        if (["allocated", "provider_confirmed", "split_allocated", "admin_resolved"].includes(row.allocation_status)) {
          acc.allocated += Number(row.allocated_amount ?? amount);
        } else {
          acc.unallocated += amount;
        }
        if (row.payout_eligibility_status === "held") acc.held += amount;
        if (row.payout_eligibility_status === "eligible") acc.eligible += amount;
        if (row.allocation_status === "provider_declined") acc.declined += amount;
        return acc;
      },
      { received: 0, allocated: 0, unallocated: 0, held: 0, eligible: 0, declined: 0 },
    );

    return successResponse({
      rows,
      totals,
      count: rows.length,
    });
  } catch (error) {
    return handleApiError(error, "Failed to load Paystack Terminal reconciliation");
  }
}
