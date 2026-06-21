import { NextRequest } from "next/server";
import { requireAdminSection, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_MARKETING_COMMS } from "@/lib/admin-sections";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import {
  templateNeedsRepush,
  listRemoteContent,
  type NotificationTemplateWhatsAppRow,
} from "@/lib/whatsapp/content-templates";

/**
 * GET /api/admin/whatsapp/content-templates
 * List WhatsApp-capable notification templates with sync/drift status.
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_MARKETING_COMMS, request);
    const tenantId = await resolveAdminApiTenantId(request);
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("notification_templates")
      .select(
        "id, key, name, whatsapp_body, whatsapp_content_sid, whatsapp_category, whatsapp_template_status, whatsapp_approval_name, whatsapp_content_hash, whatsapp_content_error, whatsapp_content_synced_at, channels",
      )
      .contains("channels", ["whatsapp"])
      .order("key");

    if (error) throw error;

    const templates = (data ?? []).map((row) => {
      const tpl = row as unknown as NotificationTemplateWhatsAppRow;
      return {
        ...row,
        needs_repush: templateNeedsRepush(tpl),
      };
    });

    let remote: Awaited<ReturnType<typeof listRemoteContent>> = [];
    try {
      remote = await listRemoteContent(supabase, tenantId ?? "");
    } catch {
      remote = [];
    }

    return successResponse({ templates, remote });
  } catch (error) {
    return handleApiError(error, "Failed to list WhatsApp content templates");
  }
}
