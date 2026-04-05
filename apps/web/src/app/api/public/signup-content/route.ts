import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { resolveTenantFromRequest } from "@/lib/tenant/resolve-tenant-from-db";
import { fetchScopedListMerged } from "@/lib/tenant/scoped-overrides";

/**
 * GET /api/public/signup-content
 * 
 * Get signup page content for public display
 */
export async function GET(request: Request) {
  try {
    const supabase = await getSupabaseServer();
    const tenant = await resolveTenantFromRequest(request);
    const tenantId = tenant?.id ?? "";

    const scoped = await fetchScopedListMerged<Record<string, any>>({
      supabase,
      table: "page_content",
      tenantId,
      select: "*",
      apply: (q) => q.eq("page_slug", "signup").eq("is_active", true),
      dedupeKey: (row) => String(row.section_key ?? row.id ?? ""),
      orderBy: { column: "display_order", ascending: true },
    });
    const content = scoped.data;

    // Transform array to object keyed by section_key for easy access
    const contentMap: Record<string, string> = {};
    (content || []).forEach((item) => {
      contentMap[item.section_key] = item.content;
    });

    return NextResponse.json({
      data: contentMap,
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error in /api/public/signup-content:", error);
    return NextResponse.json(
      {
        data: {},
        error: null,
      },
      { status: 200 } // Return empty object for graceful degradation
    );
  }
}
