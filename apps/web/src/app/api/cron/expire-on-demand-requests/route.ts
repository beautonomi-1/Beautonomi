import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { verifyCronRequest } from "@/lib/cron-auth";
import { runLockedCronRoute } from "@/lib/cron/locked-cron-route";

const JOB_NAME = "expire-on-demand-requests";
export const maxDuration = 60;

/**
 * GET /api/cron/expire-on-demand-requests
 *
 * Marks on_demand_requests as expired where status='requested' and expires_at < now().
 * Runs daily (e.g. Vercel Cron). Expiry UX is driven by client timer and lazy expiry on GET;
 * this job is for DB cleanup only.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = verifyCronRequest(request);
    if (!auth.valid) {
      return new Response(auth.error ?? "Unauthorized", { status: 401 });
    }

    return await runLockedCronRoute(JOB_NAME, async () => {
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
    });
  } catch (error) {
    return handleApiError(error as Error, "Failed to expire on-demand requests");
  }
}
