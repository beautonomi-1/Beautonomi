import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRole } from "@/lib/supabase/auth-server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(["superadmin"]);
    const supabase = await getSupabaseServer();
    const { id } = await params;

    const { data, error } = await supabase
      .from("sms_templates")
      .select("*")
      .eq("id", id)
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
  } catch (error: any) {
    console.error("Error fetching SMS template:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch SMS template" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRole(["superadmin"]);
    const supabase = await getSupabaseServer();
    const { id } = await params;

    const body = await request.json();
    const { name, message_template, category, variables, enabled } = body;

    // Get current template
    const { data: currentTemplate } = await supabase
      .from("sms_templates")
      .select("*")
      .eq("id", id)
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
    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (message_template !== undefined) updateData.message_template = message_template;
    if (category !== undefined) updateData.category = category;
    if (variables !== undefined) updateData.variables = variables;
    if (enabled !== undefined) updateData.enabled = enabled;

    const { data, error } = await supabase
      .from("sms_templates")
      .update(updateData)
      .eq("id", id)
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

    return NextResponse.json({ template: data });
  } catch (error: any) {
    console.error("Error updating SMS template:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update SMS template" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(["superadmin"]);
    const supabase = await getSupabaseServer();
    const { id } = await params;

    const { error } = await supabase
      .from("sms_templates")
      .delete()
      .eq("id", id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error deleting SMS template:", error);
    return NextResponse.json(
      { error: error.message || "Failed to delete SMS template" },
      { status: 500 }
    );
  }
}
