import { NextRequest } from "next/server";
import { verifyCronRequest } from "@/lib/cron-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { processScheduledAccountDeletions } from "@/lib/account/process-scheduled-deletions";

/**
 * GET /api/cron/process-account-deletions
 *
 * Permanently purges users whose self-service deletion grace period has elapsed.
 * Supports ?dry_run=1.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = verifyCronRequest(request);
    if (!auth.valid) {
      return new Response(auth.error || "Unauthorized", { status: 401 });
    }

    const dryRun = request.nextUrl.searchParams.get("dry_run") === "1";
    const admin = getSupabaseAdmin();
    const result = await processScheduledAccountDeletions(admin, {
      dryRun,
      request,
    });

    return successResponse({
      message: dryRun
        ? "Account deletion cron dry run completed"
        : "Account deletion cron completed",
      ...result,
    });
  } catch (error) {
    return handleApiError(error, "Account deletion cron failed");
  }
}
