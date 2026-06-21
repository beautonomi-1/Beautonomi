/**
 * GET /api/admin/learning/browse
 * Knowledge Base index for internal staff: published categories (incl. internal)
 * with their published articles grouped for reading/training. Any admin role.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection, handleApiError } from "@/lib/supabase/api-helpers";
import { unauthorizedResponse } from "@/lib/auth/requireRole";
import { ADMIN_SECTION_OVERVIEW } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";

type ArticleRow = {
  id: string;
  category_id: string;
  title: string;
  slug: string;
  summary: string | null;
  audience: string;
  is_internal: boolean;
  status: string;
  content_type: string | null;
  updated_at: string;
};

type CategoryRow = {
  id: string;
  title: string;
  slug: string;
  icon: string | null;
  audience: string;
  visibility: string;
  sort_order: number;
};

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_OVERVIEW, request);
    if (!user) return unauthorizedResponse("Authentication required");

    const admin = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);

    const [{ data: categories }, { data: articles }] = await Promise.all([
      admin
        .from("learning_categories")
        .select("id, title, slug, icon, audience, visibility, sort_order")
        .order("sort_order", { ascending: true })
        .order("title", { ascending: true }),
      admin
        .from("learning_articles")
        .select("id, category_id, title, slug, summary, audience, is_internal, status, content_type, updated_at")
        .eq("status", "published")
        .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
        .order("title", { ascending: true }),
    ]);

    const cats = (categories ?? []) as CategoryRow[];
    const arts = (articles ?? []) as ArticleRow[];

    const byCategory = new Map<string, ArticleRow[]>();
    for (const a of arts) {
      const list = byCategory.get(a.category_id) ?? [];
      list.push(a);
      byCategory.set(a.category_id, list);
    }

    const sections = cats
      .map((c) => ({
        ...c,
        articles: byCategory.get(c.id) ?? [],
      }))
      .filter((c) => c.articles.length > 0);

    return NextResponse.json({
      data: {
        sections,
        total_articles: arts.length,
        internal_articles: arts.filter((a) => a.is_internal).length,
      },
      error: null,
    });
  } catch (err) {
    return handleApiError(err, "Failed to load knowledge base");
  }
}
