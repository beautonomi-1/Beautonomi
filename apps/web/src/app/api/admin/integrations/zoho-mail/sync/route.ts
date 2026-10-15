import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_INTEGRATIONS_DEV } from "@/lib/admin-sections";
import { runLockedCronRoute } from "@/lib/cron/locked-cron-route";
import { syncZohoSupportInbox } from "@/lib/support/zoho-mail-ingest";

const JOB_NAME = "sync-zoho-support-mail";

export async function POST(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_INTEGRATIONS_DEV, request);
    const body = (await request.json().catch(() => ({}))) as {
      connection_id?: string;
      mailbox_id?: string;
    };
    return runLockedCronRoute(JOB_NAME, async () => {
      const supabase = getSupabaseAdmin();
      const result = await syncZohoSupportInbox(supabase, {
        connectionId: body.connection_id,
        mailboxId: body.mailbox_id,
      });
      return successResponse(result);
    });
  } catch (error) {
    return handleApiError(error, "Zoho sync failed");
  }
}
