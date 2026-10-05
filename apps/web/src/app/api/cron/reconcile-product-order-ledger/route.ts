import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { verifyCronRequest } from "@/lib/cron-auth";
import { withCronLock } from "@/lib/cron/with-cron-lock";
import { reconcileProductOrderLedger } from "@/lib/orders/reconcile-product-order-ledger";
import { slackNotifyCronJobFailed } from "@/lib/integrations/slack/ops-triggers";

const JOB_NAME = "reconcile-product-order-ledger";

export const maxDuration = 300;

/**
 * GET /api/cron/reconcile-product-order-ledger
 *
 * Posts missing finance_transactions for paid platform-held product orders.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = verifyCronRequest(request);
    if (!auth.valid) {
      return new Response(auth.error || "Unauthorized", { status: 401 });
    }

    const supabase = getSupabaseAdmin();
    const lockResult = await withCronLock(
      supabase,
      JOB_NAME,
      () => reconcileProductOrderLedger(supabase),
      { staleAfterMinutes: 20 },
    );

    if (lockResult.status === "skipped") {
      return successResponse({ skipped: true, reason: lockResult.reason });
    }
    if (lockResult.status === "failed") {
      throw new Error(lockResult.error);
    }

    return successResponse(lockResult.result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    slackNotifyCronJobFailed({ cronJob: JOB_NAME, error: message });
    return handleApiError(error, "Failed to reconcile product order ledger");
  }
}
