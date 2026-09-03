import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { verifyCronRequest } from "@/lib/cron-auth";
import { withCronLock } from "@/lib/cron/with-cron-lock";
import { reconcileOnlineChargeLedger } from "@/lib/bookings/reconcile-online-charge-ledger";

const JOB_NAME = "reconcile-online-charge-ledger";
import { slackNotifyCronJobFailed } from "@/lib/integrations/slack/ops-triggers";

export const maxDuration = 300;

/**
 * GET /api/cron/reconcile-online-charge-ledger
 *
 * Posts missing finance_transactions for completed Paystack booking_payments
 * when in-process capture or webhook failed. Runs every 15 minutes.
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
      () => reconcileOnlineChargeLedger(supabase),
      { staleAfterMinutes: 20 },
    );

    if (lockResult.status === "skipped") {
      return successResponse({ skipped: true, reason: lockResult.reason });
    }
    if (lockResult.status === "failed") {
      throw new Error(lockResult.error);
    }

    const result = lockResult.result;
    if (result && result.needsReview.length + result.errors.length > 0) {
      const { slackNotifyUnrecognizedPayments } = await import(
        "@/lib/integrations/slack/ops-triggers"
      );
      slackNotifyUnrecognizedPayments({
        count: result.needsReview.length + result.errors.length,
        needsReview: result.needsReview.length,
        errors: result.errors.length,
        source: "reconcile-online-charge-ledger",
      });
    }

    return successResponse(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    slackNotifyCronJobFailed({ cronJob: "reconcile-online-charge-ledger", error: message });
    return handleApiError(error, "Failed to reconcile online charge ledger");
  }
}
