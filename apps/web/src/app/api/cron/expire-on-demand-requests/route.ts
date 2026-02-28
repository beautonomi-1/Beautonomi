import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { verifyCronRequest } from "@/lib/cron-auth";

/**
 * GET /api/cron/expire-on-demand-requests
 *
 * Marks on_demand_requests as expired where status='requested' and expires_at < now().
 * Call every minute (or every 30s) from Vercel Cron or similar.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = verifyCronRequest(request);
    if (!auth.valid) {
      return new Response(auth.error ?? "Unauthorized", { status: 401 });
    }

    const admin = getSupabaseAdmin();
    const now = new Date().toISOString();

    const { data, error } = await admin
      .from("on_demand_requests")
      .update({ status: "expired", updated_at: now })
      .eq("status", "requested")
      .lt("expires_at", now)
      .select("id");

    if (error) throw error;

    return successResponse({
      message: "Expired on-demand requests updated",
      updated: data?.length ?? 0,
    });
  } catch (error) {
    return handleApiError(error as Error, "Failed to expire on-demand requests");
  }
}
