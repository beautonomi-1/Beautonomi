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
      .from("sms_templates")
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
    console.error("Error fetching SMS templates:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch SMS templates";
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
    const { name, message_template, category, variables, enabled } = body;

    if (!name || !message_template) {
      return NextResponse.json(
        { error: "Name and message_template are required" },
        { status: 400 }
      );
    }

    // Check character count (SMS limit is typically 160 characters)
    if (message_template.length > 160) {
      return NextResponse.json(
        { error: "SMS message cannot exceed 160 characters" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("sms_templates")
      .insert({
        name,
        message_template,
        category: category || null,
        variables: variables || [],
        enabled: enabled !== false,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) throw error;

    // Create initial version
    await supabase.from("sms_template_versions").insert({
      template_id: data.id,
      version: 1,
      message_template,
      created_by: user.id,
    });

    return NextResponse.json({ template: data });
  } catch (error: unknown) {
    console.error("Error creating SMS template:", error);
    const message = error instanceof Error ? error.message : "Failed to create SMS template";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
