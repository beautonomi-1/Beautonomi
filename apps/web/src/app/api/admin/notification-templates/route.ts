import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRole, unauthorizedResponse } from "@/lib/auth/requireRole";
import { successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
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

    const supabase = await getSupabaseServer(request);
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

    const { data: rows, error } = await query;

    if (error) throw error;

    // Map DB shape (key, title, body) to UI shape (name, type, title_template, message_template)
    const templates = (rows || []).map((row: any) => ({
      id: row.id,
      name: row.key,
      type: row.key,
      title_template: row.title ?? "",
      message_template: row.body ?? "",
      priority: "medium" as const,
      channels: Array.isArray(row.channels) ? row.channels : [],
      enabled: row.enabled !== false,
      variables: Array.isArray(row.variables) ? row.variables : [],
      created_at: row.created_at,
      updated_at: row.updated_at,
      // Pass through for edit form (email, url, description)
      key: row.key,
      title: row.title,
      body: row.body,
      email_subject: row.email_subject,
      email_body: row.email_body,
      sms_body: row.sms_body,
      url: row.url,
      description: row.description,
    }));

    return successResponse({
      templates,
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

    const supabase = await getSupabaseServer(request);
    const body = await request.json();
    const key = (body.key || body.type || (body.name && String(body.name).trim()) || "").trim();
    if (!key) {
      return errorResponse("key is required (e.g. my_notification_type)", "VALIDATION_ERROR", 400);
    }

    const { data: template, error } = await supabase
      .from("notification_templates")
      .insert({
        key: key.replace(/\s+/g, "_").toLowerCase(),
        title: body.title ?? body.title_template ?? body.name ?? "",
        body: body.body ?? body.message_template ?? "",
        channels: (() => {
          const raw = Array.isArray(body.channels) && body.channels.length > 0 ? body.channels : ["push"];
          const allowed = ["push", "email", "sms", "live_activities"];
          return raw.map((c: string) => (c === "in_app" ? "push" : c)).filter((c: string) => allowed.includes(c));
        })(),
        email_subject: body.email_subject ?? null,
        email_body: body.email_body ?? null,
        sms_body: body.sms_body ?? null,
        variables: Array.isArray(body.variables) ? body.variables : [],
        url: body.url ?? null,
        enabled: body.enabled !== undefined ? body.enabled : true,
        description: body.description ?? null,
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
