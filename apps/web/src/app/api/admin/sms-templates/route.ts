import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireAdminSection } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_MARKETING_COMMS } from "@/lib/admin-sections";
import { fetchScopedListMerged, resolveAdminTenantContext } from "@/lib/tenant/scoped-overrides";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_MARKETING_COMMS, request);
    const supabase = await getSupabaseServer(request);
    const { currentTenantId } = await resolveAdminTenantContext(request, undefined, user.role ?? null);

    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");
    const enabled = searchParams.get("enabled");

    const scoped = await fetchScopedListMerged<Record<string, unknown>>({
      supabase,
      table: "sms_templates",
      tenantId: currentTenantId,
      select: "*",
      apply: (q) => {
        let r = q;
        if (category) r = r.eq("category", category);
        if (enabled !== null) r = r.eq("enabled", enabled === "true");
        return r;
      },
      dedupeKey: (row) => String(row.name ?? row.id ?? ""),
      orderBy: { column: "created_at", ascending: false },
    });

    return NextResponse.json({ templates: scoped.data || [] });
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
    const { currentTenantId, requestedScope } = await resolveAdminTenantContext(
      request,
      body as Record<string, unknown>,
      user.role ?? null
    );
    const scopeTenantId = requestedScope.scope === "global" ? null : requestedScope.tenantId ?? currentTenantId;

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
        tenant_id: scopeTenantId,
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
