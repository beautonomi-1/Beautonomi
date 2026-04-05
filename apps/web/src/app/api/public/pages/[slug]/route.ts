import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { resolveTenantFromRequest } from "@/lib/tenant/resolve-tenant-from-db";
import { fetchScopedListMerged } from "@/lib/tenant/scoped-overrides";

/**
 * GET /api/public/pages/[slug]
 * 
 * Get all active content for a specific page
 * Returns content grouped by section_key
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    
    const supabase = await getSupabaseServer();
    const tenant = await resolveTenantFromRequest(request);
    const tenantId = tenant?.id ?? "";

    const scoped = await fetchScopedListMerged<Record<string, any>>({
      supabase,
      table: "page_content",
      tenantId,
      select: "*",
      apply: (q) => q.eq("page_slug", slug).eq("is_active", true),
      dedupeKey: (row) => String(row.section_key ?? row.id ?? ""),
      orderBy: { column: "display_order", ascending: true },
    });
    const pageContent = scoped.data;

    // Group content by section_key
    const groupedContent = (pageContent || []).reduce((acc, item) => {
      if (!acc[item.section_key]) {
        acc[item.section_key] = [];
      }
      acc[item.section_key].push(item);
      return acc;
    }, {} as Record<string, typeof pageContent>);

    return NextResponse.json({
      data: groupedContent,
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error in /api/public/pages/[slug]:", error);
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
