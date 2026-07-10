import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  getProviderIdForUser,
  successResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";

/**
 * GET /api/provider/paycloud/reconciliation
 * Provider-facing PayCloud payment exceptions and match status.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase, { request });
    if (!providerId) {
      return successResponse({ payments: [], summary: { total: 0, exceptions: 0 } });
    }

    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const status = searchParams.get("status");

    let query = supabase
      .from("provider_paycloud_payments")
      .select(
        "id, merchant_order_no, amount, expected_amount, amount_match_status, status, currency, entity_type, entity_id, created_at, updated_at",
      )
      .eq("provider_id", providerId)
      .order("created_at", { ascending: false })
      .limit(200);

    if (from) query = query.gte("created_at", from);
    if (to) query = query.lte("created_at", to);
    if (status) query = query.eq("status", status);

    const { data: payments, error } = await query;
    if (error) throw error;

    const rows = payments ?? [];
    const exceptions = rows.filter(
      (p: any) =>
        p.amount_match_status && p.amount_match_status !== "exact" && p.amount_match_status !== "pending",
    ).length;

    return successResponse({
      payments: rows,
      summary: { total: rows.length, exceptions },
    });
  } catch (error) {
    return handleApiError(error, "Failed to load PayCloud reconciliation");
  }
}
