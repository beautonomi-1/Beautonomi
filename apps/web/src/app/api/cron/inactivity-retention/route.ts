import { NextRequest } from "next/server";
import { verifyCronRequest } from "@/lib/cron-auth";
import { successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { runInactivityRetentionArchives, sendInactivityRetentionWarnings } from "@/lib/retention/inactivity-retention";

/**
 * GET /api/cron/inactivity-retention
 * 1) Send 6-month inactivity warnings (batched) via email + push.
 * 2) Deactivate accounts past scheduled archive date who have not signed in since the warning.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = verifyCronRequest(request);
    if (!auth.valid) {
      return new Response(auth.error || "Unauthorized", { status: 401 });
    }

    const maxBatches = 8;
    let totalClaimed = 0;
    let totalNotify = 0;
    const allErrors: string[] = [];
    for (let i = 0; i < maxBatches; i++) {
      const warn = await sendInactivityRetentionWarnings(200);
      totalClaimed += warn.claimed;
      totalNotify += warn.notificationsAttempted;
      allErrors.push(...warn.errors);
      if (warn.claimed === 0) break;
    }

    const archive = await runInactivityRetentionArchives();

    return successResponse({
      message: "Inactivity retention job completed",
      warnings: {
        claimed: totalClaimed,
        notificationsAttempted: totalNotify,
        errors: allErrors,
      },
      archives: {
        archived: archive.archived,
        error: archive.error,
      },
    });
  } catch (error) {
    return handleApiError(error, "Inactivity retention cron failed");
  }
}
