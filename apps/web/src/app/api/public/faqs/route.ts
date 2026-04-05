import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { resolveTenantFromRequest } from "@/lib/tenant/resolve-tenant-from-db";
import { fetchScopedListMerged } from "@/lib/tenant/scoped-overrides";

/**
 * GET /api/public/faqs
 * 
 * Get all active FAQs, optionally filtered by category
 */
export async function GET(request: Request) {
  try {
    const supabase = await getSupabaseServer();
    const tenant = await resolveTenantFromRequest(request);
    const tenantId = tenant?.id ?? "";
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");
    const limit = searchParams.get("limit");

    const limitNum = limit ? parseInt(limit, 10) : NaN;
    const scoped = await fetchScopedListMerged<Record<string, any>>({
      supabase,
      table: "faqs",
      tenantId,
      select: "*",
      apply: (q) => {
        let r = q.eq("is_active", true);
        if (category) r = r.eq("category", category);
        if (!isNaN(limitNum) && limitNum > 0) r = r.limit(limitNum);
        return r;
      },
      dedupeKey: (row) => `${String(row.category ?? "")}::${String(row.question ?? row.id ?? "")}`,
      orderBy: { column: "display_order", ascending: true },
    });
    const faqs = scoped.data;

    return NextResponse.json({
      data: faqs || [],
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error in /api/public/faqs:", error);
    return NextResponse.json(
      {
        data: [],
        error: {
          message: "Failed to fetch FAQs",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}
