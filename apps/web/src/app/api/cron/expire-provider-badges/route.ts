/**
 * GET /api/cron/expire-provider-badges
 *
 * Re-evaluates every provider whose tier badge has passed its 30-day maintenance
 * window. `expire_provider_badges()` calls `check_provider_badges` per provider,
 * which renews the badge if the provider still meets the requirements, or clears
 * the badge and unsets `is_featured` if they no longer qualify.
 *
 * Runs daily via Vercel cron.
 */

import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { verifyCronRequest } from "@/lib/cron-auth";

export async function GET(request: NextRequest) {
  try {
    const auth = verifyCronRequest(request);
    if (!auth.valid) {
      return new Response(auth.error || "Unauthorized", { status: 401 });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.rpc("expire_provider_badges");

    if (error) {
      console.error("Error expiring provider badges:", error);
      return handleApiError(error, "Failed to expire provider badges");
    }

    const reevaluated = typeof data === "number" ? data : 0;
    if (reevaluated > 0) {
      console.log(`expire-provider-badges: re-evaluated ${reevaluated} provider badge(s)`);
    }

    return successResponse({ providers_reevaluated: reevaluated });
  } catch (error) {
    return handleApiError(error, "Cron: expire-provider-badges failed");
  }
}
