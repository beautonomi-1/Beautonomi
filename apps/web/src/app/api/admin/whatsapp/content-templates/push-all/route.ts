import { NextRequest } from "next/server";
import { requireAdminSection, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_MARKETING_COMMS } from "@/lib/admin-sections";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import {
  pushContentTemplate,
  submitForWhatsAppApproval,
  templateNeedsRepush,
  type NotificationTemplateWhatsAppRow,
} from "@/lib/whatsapp/content-templates";
import type { WhatsAppCategory } from "@/lib/whatsapp/approval-readiness";

/**
 * POST /api/admin/whatsapp/content-templates/push-all
 * Bulk push WhatsApp-capable templates that need (re)push.
 */
export async function POST(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_MARKETING_COMMS, request);
    const tenantId = await resolveAdminApiTenantId(request);
    const body = await request.json().catch(() => ({}));
    const submit = body.submit !== false;
    const forceAll = body.force === true;

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("notification_templates")
      .select("*")
      .contains("valid_channels", ["whatsapp"]);

    if (error) throw error;

    const results: Array<{ id: string; key: string; ok: boolean; content_sid?: string; error?: string }> = [];

    for (const row of data ?? []) {
      const tpl = row as NotificationTemplateWhatsAppRow & { id: string; key: string };
      if (!forceAll && !templateNeedsRepush(tpl)) {
        results.push({ id: tpl.id, key: tpl.key, ok: true, content_sid: tpl.whatsapp_content_sid ?? undefined });
        continue;
      }

      try {
        const { contentSid, hash } = await pushContentTemplate(supabase, tenantId ?? "", tpl);
        let status = "draft";

        if (submit) {
          const name =
            tpl.whatsapp_approval_name ||
            tpl.key.replace(/[^a-z0-9]+/gi, "_").toLowerCase();
          const category = (tpl.whatsapp_category || "utility") as WhatsAppCategory;
          await submitForWhatsAppApproval(supabase, tenantId ?? "", contentSid, name, category);
          status = "pending";
        }

        await supabase
          .from("notification_templates")
          .update({
            whatsapp_content_sid: contentSid,
            whatsapp_content_hash: hash,
            whatsapp_content_synced_at: new Date().toISOString(),
            whatsapp_template_status: status,
            whatsapp_content_error: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", tpl.id);

        results.push({ id: tpl.id, key: tpl.key, ok: true, content_sid: contentSid });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        results.push({ id: tpl.id, key: tpl.key, ok: false, error: msg });
      }
    }

    return successResponse({
      pushed: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    });
  } catch (error) {
    return handleApiError(error, "Failed to bulk push WhatsApp templates");
  }
}
