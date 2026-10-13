import { NextRequest } from "next/server";
import { verifyCronRequest } from "@/lib/cron-auth";
import { runLockedCronRoute } from "@/lib/cron/locked-cron-route";
import { successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { flushProviderDigests } from "@/lib/notifications/provider-notification-digest";

export const maxDuration = 300;

const JOB_NAME = "send-provider-notification-digests";

/**
 * GET /api/cron/send-provider-notification-digests
 *
 * Flushes deferred provider-app push notifications batched for users on daily/weekly digest mode.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = verifyCronRequest(request);
    if (!auth.valid) {
      return new Response(auth.error || "Unauthorized", { status: 401 });
    }

    return await runLockedCronRoute(JOB_NAME, async () => {
      const daily = await flushProviderDigests("daily");
      const weekly = await flushProviderDigests("weekly");

      return successResponse({
        message: "Provider notification digests flushed",
        daily,
        weekly,
      });
    });
  } catch (error) {
    return handleApiError(error, "Failed to flush provider notification digests");
  }
}
