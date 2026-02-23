import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi } from "@/lib/supabase/api-helpers";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRoleInApi(["superadmin"], request);
    const { id } = await params;

    const supabase = await getSupabaseServer(request);

    const { data, error } = await supabase
      .from("footer_app_links")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      console.error("Error fetching app link:", error);
      return NextResponse.json(
        { error: "App link not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ data, error: null });
  } catch (error: any) {
    if (error.status) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Error in GET /api/admin/content/app-links/[id]:", error);
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
    await requireRoleInApi(["superadmin"], request);
    const { id } = await params;

    const supabase = await getSupabaseServer(request);
    const body = await request.json();

    const { platform, title, href, display_order, is_active } = body;

    const updateData: any = {};
    if (platform !== undefined) updateData.platform = platform;
    if (title !== undefined) updateData.title = title;
    if (href !== undefined) updateData.href = href;
    if (display_order !== undefined) updateData.display_order = display_order;
    if (is_active !== undefined) updateData.is_active = is_active;

    const { data, error } = await (supabase.from("footer_app_links") as any)
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Error updating app link:", error);
      return NextResponse.json(
        { error: "Failed to update app link" },
        { status: 500 }
      );
    }

    return NextResponse.json({ data, error: null });
  } catch (error: any) {
    if (error.status) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Error in PUT /api/admin/content/app-links/[id]:", error);
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
    await requireRoleInApi(["superadmin"], request);
    const { id } = await params;

    const supabase = await getSupabaseServer(request);

    const { error } = await supabase
      .from("footer_app_links")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Error deleting app link:", error);
      return NextResponse.json(
        { error: "Failed to delete app link" },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: null, error: null });
  } catch (error: any) {
    if (error.status) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Error in DELETE /api/admin/content/app-links/[id]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
