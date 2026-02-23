import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";

/**
 * GET /api/admin/nav-counts
 * Returns pending/open counts for admin sidebar badges (superadmin only).
 * Keys match admin nav hrefs so the shell can show counts per menu item.
 */
export async function GET(request: NextRequest) {
  try {
    await requireRoleInApi(["superadmin"], request);
    const supabase = getSupabaseAdmin();

    const [
      verificationsResult,
      payoutsResult,
      supportTicketsResult,
      refundsResult,
      disputesResult,
    ] = await Promise.all([
      supabase
        .from("user_verifications")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),
      supabase
        .from("payouts")
        .select("id", { count: "exact", head: true })
        .in("status", ["pending", "processing"]),
      supabase
        .from("support_tickets")
        .select("id", { count: "exact", head: true })
        .in("status", ["open", "in_progress"]),
      supabase
        .from("payment_transactions")
        .select("id", { count: "exact", head: true })
        .or("transaction_type.eq.refund,refund_amount.not.is.null,status.eq.success")
        .eq("status", "pending"),
      supabase
        .from("booking_disputes")
        .select("id", { count: "exact", head: true })
        .eq("status", "open"),
    ]);

    const counts: Record<string, number> = {
      "/admin/verifications": verificationsResult.count ?? 0,
      "/admin/payouts": payoutsResult.count ?? 0,
      "/admin/support-tickets": supportTicketsResult.count ?? 0,
      "/admin/refunds": refundsResult.count ?? 0,
      "/admin/disputes": disputesResult.count ?? 0,
    };

    return successResponse(counts);
  } catch (error) {
    return handleApiError(error, "Failed to fetch nav counts");
  }
}
