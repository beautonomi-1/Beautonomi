import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { verifyCronRequest } from "@/lib/cron-auth";
import { successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { loadAppleIapConfig } from "@/lib/iap/apple/config";
import { reconcileStaleAppleSubscriptions } from "@/lib/iap/apple/reconcile-subscriptions";
import { runLockedCronRoute } from "@/lib/cron/locked-cron-route";

const JOB_NAME = "reconcile-apple-subscriptions";
export const maxDuration = 300;

/**
 * GET /api/cron/reconcile-apple-subscriptions
 * Poll App Store Server API for every stale Apple-billed subscription.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = verifyCronRequest(request);
    if (!auth.valid) {
      return new Response(JSON.stringify({ error: auth.error }), { status: 401 });
    }

    return await runLockedCronRoute(JOB_NAME, async () => {
      const supabase = getSupabaseAdmin();
      const config = await loadAppleIapConfig(supabase);
      if (!config) {
        return successResponse({ reconciled: 0, skipped: "Apple IAP not configured" });
      }

      const result = await reconcileStaleAppleSubscriptions({ supabase, config });
      return successResponse(result);
    });
  } catch (error) {
    return handleApiError(error);
  }
}
