import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  handleApiError,
  notFoundResponse,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_USERS_TRUST } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { getUserRowIfAccessibleToAdminTenant } from "@/lib/tenant/admin-user-tenant-access";

/**
 * GET /api/admin/users/[id]/loyalty
 *
 * Fetch loyalty balance and recent transactions for a user (ledger-backed).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminSection(ADMIN_SECTION_USERS_TRUST, request);
    const { id: userId } = await params;
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);

    const accessible = await getUserRowIfAccessibleToAdminTenant(supabase, tenantId, userId);
    if (!accessible) {
      return notFoundResponse("User not found");
    }

    let balance = 0;
    const { data: balData, error: balRpcErr } = await supabase.rpc("get_customer_available_points", {
      customer_uuid: userId,
    });
    if (!balRpcErr && balData != null) {
      balance = Math.max(Number(balData) || 0, 0);
    }

    const { data: txRaw } = await supabase
      .from("loyalty_points_ledger")
      .select("id, points_amount, transaction_type, booking_id, description, metadata, created_at")
      .eq("customer_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);

    const transactions = (txRaw ?? []).map((row) => ({
      ...row,
      points: row.points_amount,
    }));

    return successResponse({
      balance,
      transactions,
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch loyalty data");
  }
}
