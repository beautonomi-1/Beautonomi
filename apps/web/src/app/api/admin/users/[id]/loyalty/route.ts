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

/**
 * GET /api/admin/users/[id]/loyalty
 *
 * Fetch loyalty balance and recent transactions for a user.
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

    // Verify user belongs to this tenant (same guard as GET /api/admin/users/[id])
    const { data: targetUser, error: targetErr } = await supabase
      .from("users")
      .select("id")
      .eq("id", userId)
      .eq("preferred_home_tenant_id", tenantId)
      .maybeSingle();
    if (targetErr || !targetUser) {
      return notFoundResponse("User not found");
    }

    let balance = 0;
    const { data: balData, error: balRpcErr } = await supabase.rpc("get_user_loyalty_balance", {
      p_user_id: userId,
    });
    const rpcBalance = !balRpcErr && balData != null ? Number(balData) : NaN;
    if (Number.isFinite(rpcBalance)) {
      balance = Math.max(rpcBalance, 0);
    } else {
      const { data: txRows } = await supabase
        .from("loyalty_point_transactions")
        .select("points, transaction_type, expires_at")
        .eq("user_id", userId);

      if (txRows) {
        balance = txRows.reduce((sum, t) => {
          const row = t as { points: number; transaction_type: string; expires_at: string | null };
          const isExpired = row.expires_at && new Date(row.expires_at) < new Date();
          if (isExpired) return sum;
          if (row.transaction_type === "earned" || row.transaction_type === "adjusted") {
            return sum + Number(row.points || 0);
          } else if (row.transaction_type === "redeemed" || row.transaction_type === "expired") {
            return sum - Number(row.points || 0);
          }
          return sum;
        }, 0);
        balance = Math.max(balance, 0);
      }
    }

    const { data: txRaw } = await supabase
      .from("loyalty_point_transactions")
      .select("id, points, transaction_type, reference_type, reference_id, description, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);

    const transactions = (txRaw ?? []).map((row) => ({
      ...row,
      source: row.reference_type ?? null,
    }));

    return successResponse({
      balance,
      transactions,
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch loyalty data");
  }
}
