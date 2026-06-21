import { NextRequest } from "next/server";
import { unauthorizedResponse } from "@/lib/auth/requireRole";
import { requireAdminSection, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_MARKETING_COMMS } from "@/lib/admin-sections";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import {
  pushContentTemplate,
  submitForWhatsAppApproval,
  syncApprovalStatus,
  deleteContentTemplate,
  type NotificationTemplateWhatsAppRow,
} from "@/lib/whatsapp/content-templates";
import type { WhatsAppCategory } from "@/lib/whatsapp/approval-readiness";

async function loadTemplate(id: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("notification_templates")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) throw new Error("Template not found");
  return data as NotificationTemplateWhatsAppRow & { id: string };
}

/**
 * POST /api/admin/notification-templates/[id]/whatsapp/push
 * Create Twilio Content + optionally submit for approval.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_MARKETING_COMMS, request);
    if (!user) return unauthorizedResponse("Authentication required");

    const tenantId = await resolveAdminApiTenantId(request);
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const submit = body.submit !== false;

    const template = await loadTemplate(id);
    const supabase = getSupabaseAdmin();

    const { contentSid, hash } = await pushContentTemplate(supabase, tenantId ?? "", template);

    let status = "draft";
    let error: string | null = null;

    if (submit) {
      const name =
        template.whatsapp_approval_name ||
        template.key.replace(/[^a-z0-9]+/gi, "_").toLowerCase();
      const category = (template.whatsapp_category || "utility") as WhatsAppCategory;
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
        whatsapp_content_error: error,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    return successResponse({ content_sid: contentSid, status });
  } catch (error) {
    return handleApiError(error, "Failed to push WhatsApp template");
  }
}

/**
 * GET — sync approval status from Twilio.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_MARKETING_COMMS, request);
    if (!user) return unauthorizedResponse("Authentication required");

    const tenantId = await resolveAdminApiTenantId(request);
    const { id } = await params;
    const template = await loadTemplate(id);
    const sid = template.whatsapp_content_sid;
    if (!sid) {
      return successResponse({ status: "unknown", message: "No Content SID" });
    }

    const supabase = getSupabaseAdmin();
    const { status, rejectionReason } = await syncApprovalStatus(supabase, tenantId ?? "", sid);

    await supabase
      .from("notification_templates")
      .update({
        whatsapp_template_status: status,
        whatsapp_content_error: rejectionReason ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    return successResponse({ status, rejection_reason: rejectionReason });
  } catch (error) {
    return handleApiError(error, "Failed to sync WhatsApp template status");
  }
}

/**
 * DELETE — remove remote Content template.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_MARKETING_COMMS, request);
    if (!user) return unauthorizedResponse("Authentication required");

    const tenantId = await resolveAdminApiTenantId(request);
    const { id } = await params;
    const template = await loadTemplate(id);
    const sid = template.whatsapp_content_sid;
    if (sid) {
      const supabase = getSupabaseAdmin();
      await deleteContentTemplate(supabase, tenantId ?? "", sid);
    }

    const supabase = getSupabaseAdmin();
    await supabase
      .from("notification_templates")
      .update({
        whatsapp_content_sid: null,
        whatsapp_template_status: "unknown",
        whatsapp_content_hash: null,
        whatsapp_content_synced_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    return successResponse({ deleted: true });
  } catch (error) {
    return handleApiError(error, "Failed to delete WhatsApp Content template");
  }
}
