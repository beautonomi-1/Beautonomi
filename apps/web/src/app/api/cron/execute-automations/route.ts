import { NextRequest } from "next/server";
import { handleApiError } from "@/lib/supabase/api-helpers";
import { verifyCronRequest } from "@/lib/cron-auth";
import { runLockedCronRoute } from "@/lib/cron/locked-cron-route";
import { POST as executeAutomationsPost } from "@/app/api/provider/automations/execute/route";

/**
 * GET /api/cron/execute-automations
 *
 * Cron wrapper that directly invokes the automation execution handler,
 * avoiding the latency, cost, and URL-resolution risks of a self-fetch.
 */
export const maxDuration = 300;
const JOB_NAME = "execute-automations";

export async function GET(request: NextRequest) {
  const auth = verifyCronRequest(request);
  if (!auth.valid) {
    return new Response(auth.error || "Unauthorized", { status: 401 });
  }

  return runLockedCronRoute(JOB_NAME, () => runJob(request));
}

async function runJob(request: NextRequest) {
  try {
    const secret = process.env.CRON_SECRET || process.env.INTERNAL_API_SECRET || "";
    const syntheticRequest = new NextRequest(
      new URL("/api/provider/automations/execute", request.url),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${secret}`,
        },
      }
    );

    return await executeAutomationsPost(syntheticRequest);
  } catch (error) {
    return handleApiError(error, "Failed to execute automations");
  }
}
