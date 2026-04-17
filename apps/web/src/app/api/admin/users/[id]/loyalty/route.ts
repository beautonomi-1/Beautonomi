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

    // Verify user belongs to this tenant
    const { data: targetUser, error: targetErr } = await supabase
      .from("users")
      .select("id")
      .eq("id", userId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (targetErr) throw targetErr;
    if (!targetUser) return notFoundResponse("User not found");

    let balance = 0;
    try {
      const { data: balData } = await supabase.rpc("get_user_loyalty_balance", {
        p_user_id: userId,
      });
      balance = typeof balData === "number" ? balData : 0;
    } catch {
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

    const { data: transactions } = await supabase
      .from("loyalty_point_transactions")
      .select("id, points, transaction_type, source, description, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);

    return successResponse({
      balance,
      transactions: transactions || [],
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch loyalty data");
  }
}
