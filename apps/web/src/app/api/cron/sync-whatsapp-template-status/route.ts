import { NextRequest, NextResponse } from "next/server";
import { verifyCronRequest } from "@/lib/cron-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { syncApprovalStatus } from "@/lib/whatsapp/content-templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BATCH_LIMIT = 25;

/**
 * GET /api/cron/sync-whatsapp-template-status
 * Poll Twilio for pending WhatsApp Content template approvals.
 */
export async function GET(request: NextRequest) {
  if (!verifyCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const { data: rows } = await supabase
    .from("notification_templates")
    .select("id, whatsapp_content_sid, whatsapp_template_status")
    .not("whatsapp_content_sid", "is", null)
    .in("whatsapp_template_status", ["draft", "received", "pending", "unknown"])
    .limit(BATCH_LIMIT);

  let synced = 0;
  for (const row of rows ?? []) {
    const sid = row.whatsapp_content_sid as string;
    if (!sid?.startsWith("HX")) continue;
    try {
      const { status, rejectionReason } = await syncApprovalStatus(supabase, "", sid);
      await supabase
        .from("notification_templates")
        .update({
          whatsapp_template_status: status,
          whatsapp_content_error: rejectionReason ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      synced++;
    } catch (e) {
      console.warn("[sync-whatsapp-template-status]", sid, e);
    }
  }

  return NextResponse.json({ ok: true, synced, checked: rows?.length ?? 0 });
}
