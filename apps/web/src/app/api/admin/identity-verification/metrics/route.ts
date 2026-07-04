/**
 * GET /api/admin/identity-verification/metrics
 *
 * Dashboard metrics: approval rate, pending count, rejection breakdown,
 * webhook health. Superadmin only.
 */
import { NextRequest } from "next/server";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  try {
    await requireRoleInApi(["superadmin"], request);
    const supabase = getSupabaseAdmin();

    const [
      { count: total },
      { count: approved },
      { count: pending },
      { count: rejected },
      { count: needsReview },
    ] = await Promise.all([
      supabase.from("identity_verification_sessions").select("*", { count: "exact", head: true }),
      supabase.from("identity_verification_sessions").select("*", { count: "exact", head: true }).eq("status", "approved"),
      supabase.from("identity_verification_sessions").select("*", { count: "exact", head: true }).eq("status", "pending_review"),
      supabase.from("identity_verification_sessions").select("*", { count: "exact", head: true }).eq("status", "rejected"),
      supabase.from("identity_verification_sessions").select("*", { count: "exact", head: true })
        .or("name_mismatch_flag.eq.true,identity_dedupe_flag.eq.true,under_age_flag.eq.true"),
    ]);

    // Recent webhook deliveries (last 24h)
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count: webhooksLast24h } = await supabase
      .from("identity_verification_events")
      .select("*", { count: "exact", head: true })
      .gte("received_at", since);

    const approvalRate = total && approved ? Math.round((approved / total) * 100) : 0;

    return successResponse({
      total:            total ?? 0,
      approved:         approved ?? 0,
      pending_review:   pending ?? 0,
      rejected:         rejected ?? 0,
      needs_review:     needsReview ?? 0,
      approval_rate_pct:approvalRate,
      webhooks_last_24h:webhooksLast24h ?? 0,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
