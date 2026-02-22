import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRole, unauthorizedResponse } from "@/lib/auth/requireRole";
import { successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { writeAuditLog } from "@/lib/audit/audit";

/**
 * GET /api/admin/notification-templates
 * 
 * Get all notification templates
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireRole(["superadmin"]);
    if (!auth) {
      return unauthorizedResponse("Authentication required");
    }

    const supabase = await getSupabaseServer();
    const { searchParams } = new URL(request.url);
    const enabled = searchParams.get("enabled");
    const channel = searchParams.get("channel");

    let query = supabase
      .from("notification_templates")
      .select("*")
      .order("created_at", { ascending: false });

    if (enabled !== null) {
      query = query.eq("enabled", enabled === "true");
    }

    if (channel) {
      query = query.contains("channels", [channel]);
    }

    const { data: templates, error } = await query;

    if (error) throw error;

    return successResponse({
      templates: templates || [],
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch notification templates");
  }
}

/**
 * POST /api/admin/notification-templates
 * 
 * Create a new notification template
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireRole(["superadmin"]);
    if (!auth) {
      return unauthorizedResponse("Authentication required");
    }

    const supabase = await getSupabaseServer();
    const body = await request.json();

    const { data: template, error } = await supabase
      .from("notification_templates")
      .insert({
        key: body.key,
        title: body.title || body.name,
        body: body.body || body.message_template,
        channels: body.channels || ["push"],
        email_subject: body.email_subject,
        email_body: body.email_body,
        sms_body: body.sms_body,
        variables: body.variables || [],
        url: body.url,
        enabled: body.enabled !== undefined ? body.enabled : true,
        description: body.description,
      })
      .select()
      .single();

    if (error) throw error;

    await writeAuditLog({
      actor_user_id: auth.user.id,
      actor_role: (auth.user as any).role || "superadmin",
      action: "admin.notification_templates.create",
      entity_type: "notification_template",
      entity_id: template.id,
      metadata: { key: body.key },
    });

    return successResponse({ template });
  } catch (error) {
    return handleApiError(error, "Failed to create notification template");
  }
}
