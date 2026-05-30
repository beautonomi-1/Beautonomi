import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getOffsetPaginationParams,
  handleApiError,
  requireAdminSection,
  successResponse,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_FINANCE } from "@/lib/admin-sections";

export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_FINANCE, request);
    const supabase = getSupabaseAdmin();
    const { searchParams } = new URL(request.url);
    const { limit, offset } = getOffsetPaginationParams(request, { defaultLimit: 50, maxLimit: 200 });
    const allocationStatus = searchParams.get("allocation_status");
    const payoutStatus = searchParams.get("payout_status");
    const providerId = searchParams.get("provider_id");

    let query = (supabase.from("provider_paystack_terminal_payments") as any)
      .select(
        `
          *,
          provider:providers(id, business_name, tenant_id),
          terminal:provider_paystack_virtual_terminals(id, name, terminal_code),
          allocations:provider_terminal_payment_allocations(*)
        `,
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (allocationStatus) query = query.eq("allocation_status", allocationStatus);
    if (payoutStatus) query = query.eq("payout_eligibility_status", payoutStatus);
    if (providerId) query = query.eq("provider_id", providerId);

    const { data, error, count } = await query;
    if (error) throw error;

    return successResponse({
      items: data ?? [],
      total: count ?? 0,
      limit,
      offset,
      hasMore: (count ?? 0) > offset + limit,
    });
  } catch (error) {
    return handleApiError(error, "Failed to load Paystack Terminal reconciliation");
  }
}
