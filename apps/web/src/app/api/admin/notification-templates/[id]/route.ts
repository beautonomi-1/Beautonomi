import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRole, unauthorizedResponse } from "@/lib/auth/requireRole";
import { successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { writeAuditLog } from "@/lib/audit/audit";

/**
 * GET /api/admin/notification-templates/[id]
 * 
 * Get a single notification template
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireRole(["superadmin"]);
    if (!auth) {
      return unauthorizedResponse("Authentication required");
    }

    const supabase = await getSupabaseServer(request);
    const { id } = params;

    const { data: template, error } = await supabase
      .from("notification_templates")
      .select("*")
      .eq("id", id)
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
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireRole(["superadmin"]);
    if (!auth) {
      return unauthorizedResponse("Authentication required");
    }

    const supabase = await getSupabaseServer(request);
    const { id } = params;
    const body = await request.json();

    const updateData: any = {};
    if (body.title !== undefined) updateData.title = body.title;
    if (body.body !== undefined) updateData.body = body.body;
    if (body.channels !== undefined) updateData.channels = body.channels;
    if (body.email_subject !== undefined) updateData.email_subject = body.email_subject;
    if (body.email_body !== undefined) updateData.email_body = body.email_body;
    if (body.sms_body !== undefined) updateData.sms_body = body.sms_body;
    if (body.variables !== undefined) updateData.variables = body.variables;
    if (body.url !== undefined) updateData.url = body.url;
    if (body.enabled !== undefined) updateData.enabled = body.enabled;
    if (body.description !== undefined) updateData.description = body.description;

    const { data: template, error } = await supabase
      .from("notification_templates")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    await writeAuditLog({
      actor_user_id: auth.user.id,
      actor_role: (auth.user as any).role || "superadmin",
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
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireRole(["superadmin"]);
    if (!auth) {
      return unauthorizedResponse("Authentication required");
    }

    const supabase = await getSupabaseServer(request);
    const { id } = params;

    const { error } = await supabase
      .from("notification_templates")
      .delete()
      .eq("id", id);

    if (error) throw error;

    await writeAuditLog({
      actor_user_id: auth.user.id,
      actor_role: (auth.user as any).role || "superadmin",
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
