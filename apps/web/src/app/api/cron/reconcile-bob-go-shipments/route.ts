import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { verifyCronRequest } from "@/lib/cron-auth";
import { withCronLock } from "@/lib/cron/with-cron-lock";
import { reconcileBobGoShipments } from "@/lib/orders/bob-go-reconcile-cron";

const JOB_NAME = "reconcile-bob-go-shipments";

export const maxDuration = 120;

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
      () => reconcileBobGoShipments(supabase),
      { staleAfterMinutes: 15 },
    );

    if (lockResult.status === "skipped") {
      return successResponse({ skipped: true, reason: lockResult.reason });
    }
    if (lockResult.status === "failed") {
      throw new Error(lockResult.error);
    }

    return successResponse(lockResult.result);
  } catch (err) {
    return handleApiError(err, "Bob Go shipment reconcile failed");
  }
}
