import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { unauthorizedResponse } from "@/lib/auth/requireRole";
import { requireAdminSection, successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_MARKETING_COMMS } from "@/lib/admin-sections";
import { writeAuditLog } from "@/lib/audit/audit";
import { fetchScopedListMerged, resolveAdminTenantContext } from "@/lib/tenant/scoped-overrides";

/**
 * GET /api/admin/notification-templates
 * 
 * Get all notification templates
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_MARKETING_COMMS, request);
    if (!user) {
      return unauthorizedResponse("Authentication required");
    }

    const supabase = await getSupabaseServer(request);
    const { currentTenantId } = await resolveAdminTenantContext(request, undefined, user.role ?? null);
    const { searchParams } = new URL(request.url);
    const enabled = searchParams.get("enabled");
    const channel = searchParams.get("channel");

    const scoped = await fetchScopedListMerged<Record<string, unknown>>({
      supabase,
      table: "notification_templates",
      tenantId: currentTenantId,
      select: "*",
      apply: (q) => {
        let r = q;
        if (enabled !== null) r = r.eq("enabled", enabled === "true");
        if (channel) {
          // in_app in admin UI maps to push delivery (same as legacy Next admin)
          const ch = channel === "in_app" ? "push" : channel;
          r = r.contains("channels", [ch]);
        }
        return r;
      },
      dedupeKey: (row) => String(row.key ?? row.id ?? ""),
      orderBy: { column: "created_at", ascending: false },
    });
    const rows = scoped.data;

    type TemplateRow = { id: string; key?: string; title?: string; body?: string; channels?: unknown[]; enabled?: boolean; variables?: unknown[]; created_at?: string; updated_at?: string; email_subject?: string; email_body?: string; sms_body?: string; url?: string; description?: string };
    const typedRows = (rows || []) as TemplateRow[];
    const templates = typedRows.map((row) => ({
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
    const { user } = await requireAdminSection(ADMIN_SECTION_MARKETING_COMMS, request);
    if (!user) {
      return unauthorizedResponse("Authentication required");
    }

    const supabase = await getSupabaseServer(request);
    const body = await request.json();
    const { currentTenantId, requestedScope } = await resolveAdminTenantContext(
      request,
      body as Record<string, unknown>,
      user.role ?? null
    );
    const scopeTenantId = requestedScope.scope === "global" ? null : requestedScope.tenantId ?? currentTenantId;
    const key = (body.key || body.type || (body.name && String(body.name).trim()) || "").trim();
    if (!key) {
      return errorResponse("key is required (e.g. my_notification_type)", "VALIDATION_ERROR", 400);
    }

    const { data: template, error } = await supabase
      .from("notification_templates")
      .insert({
        tenant_id: scopeTenantId,
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
      actor_user_id: user.id,
      actor_role: user.role ?? "superadmin",
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
