import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { verifyCronRequest } from "@/lib/cron-auth";
import {
  reconcilePaycloudPaymentsBatch,
  reconcileWindowFromDays,
} from "@/lib/payments/paycloud-reconcile";
import { runLockedCronRoute } from "@/lib/cron/locked-cron-route";

const JOB_NAME = "sync-paycloud-payments";
export const maxDuration = 300;

/**
 * GET /api/cron/sync-paycloud-payments
 *
 * Safety-net reconciliation for PayCloud in-person payments. Polls orderquery for
 * pending/processing payments the webhook may have missed. Idempotent on settle keys.
 */
export async function GET(request: NextRequest) {
  const auth = verifyCronRequest(request);
  if (!auth.valid) {
    return new Response(auth.error || "Unauthorized", { status: 401 });
  }
  return runLockedCronRoute(JOB_NAME, () => runJob(request), { staleAfterMinutes: 20 });
}

async function runJob(request: NextRequest) {
  try {
    const auth = verifyCronRequest(request);
    if (!auth.valid) {
      return new Response(auth.error || "Unauthorized", { status: 401 });
    }

    const supabase = getSupabaseAdmin();
    const { searchParams } = new URL(request.url);
    const days = Number.isFinite(Number(searchParams.get("days")))
      ? Math.max(1, Number(searchParams.get("days")))
      : 7;

    const from = reconcileWindowFromDays(days).toISOString();
    const { data: payments, error } = await supabase
      .from("provider_paycloud_payments")
      .select("*")
      .in("status", ["pending", "processing"])
      .gte("created_at", from)
      .order("created_at", { ascending: true })
      .limit(200);

    if (error) throw error;

    const summary = await reconcilePaycloudPaymentsBatch({
      supabase,
      payments: payments ?? [],
    });

    return successResponse({
      message: "PayCloud payment reconciliation complete",
      windowDays: days,
      ...summary,
    });
  } catch (error) {
    return handleApiError(error, "Failed to reconcile PayCloud payments");
  }
}
