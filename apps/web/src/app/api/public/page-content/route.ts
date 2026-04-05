import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { resolveTenantFromRequest } from "@/lib/tenant/resolve-tenant-from-db";
import { fetchScopedListMerged } from "@/lib/tenant/scoped-overrides";

/**
 * GET /api/public/page-content?page_slug=gift-card
 * 
 * Public API to fetch page content for a specific page slug
 * Returns only active content
 */
export async function GET(request: Request) {
  try {
    const supabase = await getSupabaseServer();
    const tenant = await resolveTenantFromRequest(request);
    const tenantId = tenant?.id ?? "";
    const { searchParams } = new URL(request.url);
    const pageSlug = searchParams.get("page_slug");

    if (!pageSlug) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "page_slug parameter is required",
            code: "MISSING_PARAMETER",
          },
        },
        { status: 400 }
      );
    }

    const scoped = await fetchScopedListMerged<Record<string, any>>({
      supabase,
      table: "page_content",
      tenantId,
      select: "*",
      apply: (q) => q.eq("page_slug", pageSlug).eq("is_active", true),
      dedupeKey: (row) => String(row.section_key ?? row.id ?? ""),
      orderBy: { column: "display_order", ascending: true },
    });
    const pages = scoped.data;

    // Transform to a map by section_key for easy access
    const contentMap: Record<string, any> = {};
    (pages || []).forEach((page: any) => {
      contentMap[page.section_key] = {
        content: page.content,
        content_type: page.content_type,
        metadata: page.metadata || {},
      };
    });

    return NextResponse.json({
      data: contentMap,
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error in /api/public/page-content:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to fetch page content",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}
