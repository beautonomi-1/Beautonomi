import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireAdminSection } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_MARKETING_COMMS } from "@/lib/admin-sections";

export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_MARKETING_COMMS, request);
    const supabase = await getSupabaseServer(request);

    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");
    const enabled = searchParams.get("enabled");

    let query = supabase
      .from("email_templates")
      .select("*")
      .order("created_at", { ascending: false });

    if (category) {
      query = query.eq("category", category);
    }

    if (enabled !== null) {
      query = query.eq("enabled", enabled === "true");
    }

    const { data, error } = await query;

    if (error) throw error;

    return NextResponse.json({ templates: data || [] });
  } catch (error: unknown) {
    console.error("Error fetching email templates:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch email templates";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_MARKETING_COMMS, request);
    const supabase = await getSupabaseServer(request);

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

    if (!name || !subject_template || !body_template) {
      return NextResponse.json(
        { error: "Name, subject_template, and body_template are required" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("email_templates")
      .insert({
        name,
        subject_template,
        body_template,
        category: category || null,
        variables: variables || [],
        is_html: is_html !== false,
        enabled: enabled !== false,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) throw error;

    // Create initial version
    await supabase.from("email_template_versions").insert({
      template_id: data.id,
      version: 1,
      subject_template,
      body_template,
      created_by: user.id,
    });

    return NextResponse.json({ template: data });
  } catch (error: unknown) {
    console.error("Error creating email template:", error);
    const message = error instanceof Error ? error.message : "Failed to create email template";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
