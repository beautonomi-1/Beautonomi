import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireAdminSection  } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_CONTENT_CATALOG } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await getSupabaseServer(request);
    const tenantId = await resolveAdminApiTenantId(request);

    const { data, error } = await supabase
      .from("footer_links")
      .select("*")
      .eq("id", id)
      .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
      .single();

    if (error) {
      console.error("Error fetching footer link:", error);
      return NextResponse.json(
        { error: "Footer link not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ data, error: null });
  } catch (error) {
    console.error("Error in GET /api/admin/content/footer-links/[id]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminSection(ADMIN_SECTION_CONTENT_CATALOG, request);
    const { id } = await params;

    const supabase = await getSupabaseServer(request);
    const tenantId = await resolveAdminApiTenantId(request);
    const body = await request.json();

    const { section, title, href, display_order, is_external, is_active } = body;

    const updateData: Record<string, unknown> = {};
    if (section !== undefined) updateData.section = section;
    if (title !== undefined) updateData.title = title;
    if (href !== undefined) updateData.href = href;
    if (display_order !== undefined) updateData.display_order = display_order;
    if (is_external !== undefined) updateData.is_external = is_external;
    if (is_active !== undefined) updateData.is_active = is_active;

    const { data, error } = await supabase
      .from("footer_links")
      .update(updateData)
      .eq("id", id)
      .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
      .select()
      .single();

    if (error) {
      console.error("Error updating footer link:", error);
      return NextResponse.json(
        { error: "Failed to update footer link" },
        { status: 500 }
      );
    }

    return NextResponse.json({ data, error: null });
  } catch (error: unknown) {
    const err = error && typeof error === "object" && "status" in error ? error as { status: number; message?: string } : null;
    if (err && typeof err.status === "number") {
      return NextResponse.json({ error: err.message ?? "Error" }, { status: err.status });
    }
    console.error("Error in PUT /api/admin/content/footer-links/[id]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminSection(ADMIN_SECTION_CONTENT_CATALOG, request);
    const { id } = await params;

    const supabase = await getSupabaseServer(request);
    const tenantId = await resolveAdminApiTenantId(request);

    const { error } = await supabase
      .from("footer_links")
      .delete()
      .eq("id", id)
      .or(`tenant_id.eq.${tenantId},tenant_id.is.null`);

    if (error) {
      console.error("Error deleting footer link:", error);
      return NextResponse.json(
        { error: "Failed to delete footer link" },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: null, error: null });
  } catch (error: unknown) {
    const err = error && typeof error === "object" && "status" in error ? error as { status: number; message?: string } : null;
    if (err && typeof err.status === "number") {
      return NextResponse.json({ error: err.message ?? "Error" }, { status: err.status });
    }
    console.error("Error in DELETE /api/admin/content/footer-links/[id]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
