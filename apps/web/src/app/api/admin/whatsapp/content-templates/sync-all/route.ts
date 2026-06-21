import { NextRequest } from "next/server";
import { requireAdminSection, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_MARKETING_COMMS } from "@/lib/admin-sections";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import {
  syncApprovalStatus,
  type NotificationTemplateWhatsAppRow,
} from "@/lib/whatsapp/content-templates";

/**
 * POST /api/admin/whatsapp/content-templates/sync-all
 * Poll Twilio approval status for all templates with a Content SID.
 */
export async function POST(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_MARKETING_COMMS, request);
    const tenantId = await resolveAdminApiTenantId(request);
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("notification_templates")
      .select("id, key, whatsapp_content_sid, whatsapp_template_status")
      .not("whatsapp_content_sid", "is", null);

    if (error) throw error;

    const results: Array<{ id: string; key: string; ok: boolean; status?: string; error?: string }> = [];

    for (const row of data ?? []) {
      const sid = String(row.whatsapp_content_sid ?? "");
      if (!sid.startsWith("HX")) continue;
      try {
        const { status, rejectionReason } = await syncApprovalStatus(supabase, tenantId ?? "", sid);
        await supabase
          .from("notification_templates")
          .update({
            whatsapp_template_status: status,
            whatsapp_content_error: rejectionReason ?? null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", row.id);
        results.push({ id: row.id as string, key: row.key as string, ok: true, status });
      } catch (e) {
        results.push({
          id: row.id as string,
          key: row.key as string,
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return successResponse({
      synced: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    });
  } catch (error) {
    return handleApiError(error, "Failed to sync WhatsApp templates");
  }
}
