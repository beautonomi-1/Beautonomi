import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireAdminSection  } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_CONTENT_CATALOG } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { fetchScopedListMerged } from "@/lib/tenant/scoped-overrides";

export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_CONTENT_CATALOG, request);
    const supabase = await getSupabaseServer(request);
    const tenantId = await resolveAdminApiTenantId(request);
    const { searchParams } = new URL(request.url);
    const section = searchParams.get("section");
    const includeInactive = searchParams.get("include_inactive") === "true";

    const scoped = await fetchScopedListMerged<Record<string, unknown>>({
      supabase,
      table: "footer_links",
      tenantId,
      select: "*",
      apply: (q) => {
        let r = q;
        if (section) r = r.eq("section", section);
        if (!includeInactive) r = r.eq("is_active", true);
        return r;
      },
      dedupeKey: (row) => `${String(row.section ?? "")}::${String(row.title ?? "")}::${String(row.href ?? "")}`,
      orderBy: { column: "display_order", ascending: true },
    });
    const data = scoped.data;

    return NextResponse.json({ data: data || [], error: null });
  } catch (error) {
    console.error("Error in GET /api/admin/content/footer-links:", error);
    // Return empty array instead of 500 error
    return NextResponse.json({ data: [], error: null });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_CONTENT_CATALOG, request);

    const supabase = await getSupabaseServer(request);
    const tenantId = await resolveAdminApiTenantId(request);
    const body = await request.json();

    const { section, title, href, display_order, is_external, is_active } = body;

    if (!section || !title || !href) {
      return NextResponse.json(
        { error: "Missing required fields: section, title, href" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("footer_links")
      .insert({
        tenant_id: tenantId,
        section,
        title,
        href,
        display_order: display_order ?? 0,
        is_external: is_external ?? false,
        is_active: is_active ?? true,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating footer link:", error);
      return NextResponse.json(
        { error: "Failed to create footer link" },
        { status: 500 }
      );
    }

    return NextResponse.json({ data, error: null }, { status: 201 });
  } catch (error: unknown) {
    if (error && typeof error === "object" && "status" in error && typeof (error as { status: number }).status === "number") {
      const err = error as { status: number; message?: string };
      return NextResponse.json({ error: err.message ?? "Error" }, { status: err.status });
    }
    console.error("Error in POST /api/admin/content/footer-links:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
