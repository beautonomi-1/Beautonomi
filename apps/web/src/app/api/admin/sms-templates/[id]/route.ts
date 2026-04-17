import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireAdminSection } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_MARKETING_COMMS } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminSection(ADMIN_SECTION_MARKETING_COMMS, request);
    const supabase = await getSupabaseServer(request);
    const tenantId = await resolveAdminApiTenantId(request);
    const { id } = await params;

    const { data, error } = await supabase
      .from("sms_templates")
      .select("*")
      .eq("id", id)
      .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
      .single();

    if (error) throw error;

    // Get versions
    const { data: versions } = await supabase
      .from("sms_template_versions")
      .select("*")
      .eq("template_id", id)
      .order("version", { ascending: false });

    return NextResponse.json({
      template: data,
      versions: versions || [],
    });
  } catch (error: unknown) {
    console.error("Error fetching SMS template:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch SMS template";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_MARKETING_COMMS, request);
    const supabase = await getSupabaseServer(request);
    const tenantId = await resolveAdminApiTenantId(request);
    const { id } = await params;

    const body = await request.json();
    const { name, message_template, category, variables, enabled } = body;

    // Get current template
    const { data: currentTemplate } = await supabase
      .from("sms_templates")
      .select("*")
      .eq("id", id)
      .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
      .single();

    if (!currentTemplate) {
      return NextResponse.json(
        { error: "Template not found" },
        { status: 404 }
      );
    }

    // Check character count if message is being updated
    if (message_template && message_template.length > 160) {
      return NextResponse.json(
        { error: "SMS message cannot exceed 160 characters" },
        { status: 400 }
      );
    }

    // Update template
    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (message_template !== undefined) updateData.message_template = message_template;
    if (category !== undefined) updateData.category = category;
    if (variables !== undefined) updateData.variables = variables;
    if (enabled !== undefined) updateData.enabled = enabled;

    const { data, error } = await supabase
      .from("sms_templates")
      .update(updateData)
      .eq("id", id)
      .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
      .select()
      .single();

    if (error) throw error;

    // Create new version if template content changed
    if (message_template) {
      const newVersion = (currentTemplate.version || 1) + 1;
      await supabase.from("sms_template_versions").insert({
        template_id: id,
        version: newVersion,
        message_template,
        created_by: user.id,
      });

      // Update version number
      await supabase
        .from("sms_templates")
        .update({ version: newVersion })
        .eq("id", id);
    }

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role ?? "superadmin",
      action: "admin.sms_template.update",
      entity_type: "sms_template",
      entity_id: id,
      module: "marketing_comms",
      risk_level: "medium",
      retention_tier: "routine",
      metadata: updateData,
      ...extractRequestMeta(request),
    });

    return NextResponse.json({ template: data });
  } catch (error: unknown) {
    console.error("Error updating SMS template:", error);
    const message = error instanceof Error ? error.message : "Failed to update SMS template";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_MARKETING_COMMS, request);
    const supabase = await getSupabaseServer(request);
    const tenantId = await resolveAdminApiTenantId(request);
    const { id } = await params;

    const { error } = await supabase
      .from("sms_templates")
      .delete()
      .eq("id", id)
      .or(`tenant_id.eq.${tenantId},tenant_id.is.null`);

    if (error) throw error;

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role ?? "superadmin",
      action: "admin.sms_template.delete",
      entity_type: "sms_template",
      entity_id: id,
      module: "marketing_comms",
      risk_level: "medium",
      retention_tier: "routine",
      ...extractRequestMeta(request),
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("Error deleting SMS template:", error);
    const message = error instanceof Error ? error.message : "Failed to delete SMS template";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
