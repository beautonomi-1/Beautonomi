import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { verifyCronRequest } from "@/lib/cron-auth";
import { runAutoFeeReconciliation } from "@/lib/admin/auto-fee-reconciliation";
import { runLockedCronRoute } from "@/lib/cron/locked-cron-route";

const JOB_NAME = "auto-fee-reconciliation";
export const maxDuration = 120;

/**
 * GET /api/cron/auto-fee-reconciliation
 *
 * Daily upsert of per-tenant gateway fee reconciliations for yesterday (UTC).
 * Actual fees = ledger-recorded Paystack fees; expected = fee config RPC sum.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = verifyCronRequest(request);
    if (!auth.valid) {
      return new Response(auth.error || "Unauthorized", { status: 401 });
    }

    return await runLockedCronRoute(JOB_NAME, async () => {
      const supabase = getSupabaseAdmin();
      const summary = await runAutoFeeReconciliation(supabase);

      return successResponse(summary);
    });
  } catch (error) {
    return handleApiError(error, "Failed to run auto fee reconciliation");
  }
}
