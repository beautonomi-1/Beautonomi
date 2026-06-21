import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { unauthorizedResponse } from "@/lib/auth/requireRole";
import { requireAdminSection, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_MARKETING_COMMS } from "@/lib/admin-sections";
import { writeAuditLog } from "@/lib/audit/audit";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";

/**
 * GET /api/admin/notification-templates/[id]
 * 
 * Get a single notification template
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_MARKETING_COMMS, request);
    if (!user) {
      return unauthorizedResponse("Authentication required");
    }

    const supabase = await getSupabaseServer(request);
    const tenantId = await resolveAdminApiTenantId(request);
    const { id } = await params;

    const { data: template, error } = await supabase
      .from("notification_templates")
      .select("*")
      .eq("id", id)
      .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
      .single();

    if (error) throw error;

    return successResponse({ template });
  } catch (error) {
    return handleApiError(error, "Failed to fetch notification template");
  }
}

/**
 * PATCH /api/admin/notification-templates/[id]
 * 
 * Update a notification template
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_MARKETING_COMMS, request);
    if (!user) {
      return unauthorizedResponse("Authentication required");
    }

    const supabase = await getSupabaseServer(request);
    const tenantId = await resolveAdminApiTenantId(request);
    const { id } = await params;
    const body = await request.json();

    const updateData: Record<string, unknown> = {};
    if (body.title !== undefined) updateData.title = body.title;
    if (body.body !== undefined) updateData.body = body.body;
    if (body.channels !== undefined) {
      const raw = Array.isArray(body.channels)
        ? body.channels
        : typeof body.channels === "string"
          ? body.channels.split(",").map((s: string) => s.trim()).filter(Boolean)
          : [];
      const allowed = ["push", "email", "sms", "live_activities", "whatsapp"];
      const normalized = Array.from(
        new Set(
          raw
            .map((c: string) => (c === "in_app" ? "push" : c))
            .filter((c: string) => allowed.includes(c)),
        ),
      );
      updateData.channels = normalized.length > 0 ? normalized : ["push"];
    }
    if (body.email_subject !== undefined) updateData.email_subject = body.email_subject;
    if (body.email_body !== undefined) updateData.email_body = body.email_body;
    if (body.sms_body !== undefined) updateData.sms_body = body.sms_body;
    if (body.variables !== undefined) {
      updateData.variables = Array.isArray(body.variables)
        ? body.variables
        : typeof body.variables === "string"
          ? body.variables.split(",").map((s: string) => s.trim()).filter(Boolean)
          : body.variables;
    }
    if (body.url !== undefined) updateData.url = body.url;
    if (body.image !== undefined) updateData.image = body.image;
    if (body.onesignal_template_id !== undefined) {
      updateData.onesignal_template_id = body.onesignal_template_id;
    }
    if (body.live_activities_config !== undefined) {
      updateData.live_activities_config = body.live_activities_config;
    }
    if (body.enabled !== undefined) updateData.enabled = body.enabled;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.whatsapp_content_sid !== undefined) updateData.whatsapp_content_sid = body.whatsapp_content_sid;
    if (body.whatsapp_content_variables !== undefined) updateData.whatsapp_content_variables = body.whatsapp_content_variables;
    if (body.whatsapp_category !== undefined) updateData.whatsapp_category = body.whatsapp_category;
    if (body.whatsapp_body !== undefined) updateData.whatsapp_body = body.whatsapp_body;
    if (body.whatsapp_approval_name !== undefined) updateData.whatsapp_approval_name = body.whatsapp_approval_name;
    if (body.whatsapp_language !== undefined) updateData.whatsapp_language = body.whatsapp_language;
    if (body.whatsapp_content_type !== undefined) updateData.whatsapp_content_type = body.whatsapp_content_type;
    if (body.whatsapp_content_definition !== undefined) updateData.whatsapp_content_definition = body.whatsapp_content_definition;
    if (body.channel_waterfall !== undefined) updateData.channel_waterfall = body.channel_waterfall;

    const { data: template, error } = await supabase
      .from("notification_templates")
      .update(updateData)
      .eq("id", id)
      .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
      .select()
      .single();

    if (error) throw error;

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role ?? "superadmin",
      action: "admin.notification_templates.update",
      entity_type: "notification_template",
      entity_id: id,
      metadata: updateData,
    });

    return successResponse({ template });
  } catch (error) {
    return handleApiError(error, "Failed to update notification template");
  }
}

/**
 * DELETE /api/admin/notification-templates/[id]
 * 
 * Delete a notification template
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_MARKETING_COMMS, request);
    if (!user) {
      return unauthorizedResponse("Authentication required");
    }

    const supabase = await getSupabaseServer(request);
    const tenantId = await resolveAdminApiTenantId(request);
    const { id } = await params;

    const { error } = await supabase
      .from("notification_templates")
      .delete()
      .eq("id", id)
      .or(`tenant_id.eq.${tenantId},tenant_id.is.null`);

    if (error) throw error;

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role ?? "superadmin",
      action: "admin.notification_templates.delete",
      entity_type: "notification_template",
      entity_id: id,
      metadata: {},
    });

    return successResponse({ success: true });
  } catch (error) {
    return handleApiError(error, "Failed to delete notification template");
  }
}
