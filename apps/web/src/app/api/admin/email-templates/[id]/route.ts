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
      .from("email_templates")
      .select("*")
      .eq("id", id)
      .single();

    if (error) throw error;

    // Get versions
    const { data: versions } = await supabase
      .from("email_template_versions")
      .select("*")
      .eq("template_id", id)
      .order("version", { ascending: false });

    return NextResponse.json({
      template: data,
      versions: versions || [],
    });
  } catch (error: any) {
    console.error("Error fetching email template:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch email template" },
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
    const {
      name,
      subject_template,
      body_template,
      category,
      variables,
      is_html,
      enabled,
    } = body;

    // Get current template
    const { data: currentTemplate } = await supabase
      .from("email_templates")
      .select("*")
      .eq("id", id)
      .single();

    if (!currentTemplate) {
      return NextResponse.json(
        { error: "Template not found" },
        { status: 404 }
      );
    }

    // Update template
    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (subject_template !== undefined) updateData.subject_template = subject_template;
    if (body_template !== undefined) updateData.body_template = body_template;
    if (category !== undefined) updateData.category = category;
    if (variables !== undefined) updateData.variables = variables;
    if (is_html !== undefined) updateData.is_html = is_html;
    if (enabled !== undefined) updateData.enabled = enabled;

    const { data, error } = await supabase
      .from("email_templates")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    // Create new version if template content changed
    if (subject_template || body_template) {
      const newVersion = (currentTemplate.version || 1) + 1;
      await supabase.from("email_template_versions").insert({
        template_id: id,
        version: newVersion,
        subject_template: subject_template || currentTemplate.subject_template,
        body_template: body_template || currentTemplate.body_template,
        created_by: user.id,
      });

      // Update version number
      await supabase
        .from("email_templates")
        .update({ version: newVersion })
        .eq("id", id);
    }

    return NextResponse.json({ template: data });
  } catch (error: any) {
    console.error("Error updating email template:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update email template" },
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
      .from("email_templates")
      .delete()
      .eq("id", id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error deleting email template:", error);
    return NextResponse.json(
      { error: error.message || "Failed to delete email template" },
      { status: 500 }
    );
  }
}
