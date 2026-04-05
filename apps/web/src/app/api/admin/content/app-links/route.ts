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
    const includeInactive = searchParams.get("include_inactive") === "true";

    const scoped = await fetchScopedListMerged<Record<string, unknown>>({
      supabase,
      table: "footer_app_links",
      tenantId,
      select: "*",
      apply: (q) => (!includeInactive ? q.eq("is_active", true) : q),
      dedupeKey: (row) => String(row.platform ?? row.id ?? ""),
      orderBy: { column: "display_order", ascending: true },
    });
    const data = scoped.data;

    return NextResponse.json({ data, error: null });
  } catch (error: unknown) {
    const status = error && typeof error === "object" && "status" in error ? (error as { status: number }).status : undefined;
    if (typeof status === "number") {
      const message = error instanceof Error ? error.message : "Unknown error";
      return NextResponse.json({ error: message }, { status });
    }
    console.error("Error in GET /api/admin/content/app-links:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_CONTENT_CATALOG, request);

    const supabase = await getSupabaseServer(request);
    const tenantId = await resolveAdminApiTenantId(request);
    const body = await request.json();

    const { platform, title, href, display_order, is_active } = body;

    if (!platform || !title || !href) {
      return NextResponse.json(
        { error: "Missing required fields: platform, title, href" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("footer_app_links")
      .insert({
        tenant_id: tenantId,
        platform,
        title,
        href,
        display_order: display_order ?? 0,
        is_active: is_active ?? true,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating app link:", error);
      return NextResponse.json(
        { error: "Failed to create app link" },
        { status: 500 }
      );
    }

    return NextResponse.json({ data, error: null }, { status: 201 });
  } catch (error: unknown) {
    const status = error && typeof error === "object" && "status" in error ? (error as { status: number }).status : undefined;
    if (typeof status === "number") {
      const message = error instanceof Error ? error.message : "Unknown error";
      return NextResponse.json({ error: message }, { status });
    }
    console.error("Error in POST /api/admin/content/app-links:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
