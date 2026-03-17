/**
 * GET /api/public/learn/article/[slug]
 * Single article by slug. Increments view count (via service role).
 * Returns parents array (breadcrumb lineage from root to article category).
 */
import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

async function getCategoryLineage(
  supabase: Awaited<ReturnType<typeof getSupabaseServer>>,
  categoryId: string
): Promise<{ title: string; slug: string }[]> {
  const lineage: { title: string; slug: string }[] = [];
  let currentId: string | null = categoryId;
  const seen = new Set<string>();
  while (currentId && !seen.has(currentId)) {
    seen.add(currentId);
    const { data: cat } = await supabase
      .from("learning_categories")
      .select("id, title, slug, parent_id")
      .eq("id", currentId)
      .single();
    if (!cat) break;
    lineage.unshift({ title: cat.title, slug: cat.slug });
    currentId = cat.parent_id ?? null;
  }
  return lineage;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const supabase = await getSupabaseServer();

    const { data: article, error } = await supabase
      .from("learning_articles")
      .select("id, category_id, title, slug, summary, body, content_format, published_at, image_url, content_type, learning_categories(id, title, slug)")
      .eq("slug", slug)
      .eq("status", "published")
      .eq("is_internal", false)
      .single();

    if (error || !article) {
      return NextResponse.json(
        { data: null, error: { message: "Article not found", code: "NOT_FOUND" } },
        { status: 404 }
      );
    }

    const parentsLineage = await getCategoryLineage(supabase, article.category_id);
    const parents = parentsLineage.map((p) => p.title);
    const parent_slugs = parentsLineage.map((p) => p.slug);

    try {
      const admin = getSupabaseAdmin();
      const { data: existing } = await admin.from("learning_article_stats").select("view_count, helpful_yes_count, helpful_no_count").eq("article_id", article.id).single();
      const view_count = (existing?.view_count ?? 0) + 1;
      await admin
        .from("learning_article_stats")
        .upsert(
          { article_id: article.id, view_count, helpful_yes_count: existing?.helpful_yes_count ?? 0, helpful_no_count: existing?.helpful_no_count ?? 0, updated_at: new Date().toISOString() },
          { onConflict: "article_id" }
        );
    } catch {
      // Non-fatal: still return article
    }

    const { data: stat } = await supabase.from("learning_article_stats").select("view_count, helpful_yes_count, helpful_no_count").eq("article_id", article.id).single();

    const { data: relatedRows } = await supabase
      .from("learning_articles")
      .select("id, title, slug, summary")
      .eq("category_id", article.category_id)
      .eq("status", "published")
      .eq("is_internal", false)
      .neq("id", article.id)
      .order("updated_at", { ascending: false })
      .limit(3);

    return NextResponse.json({
      data: {
        ...article,
        parents,
        parent_slugs,
        stats: stat ?? { view_count: 0, helpful_yes_count: 0, helpful_no_count: 0 },
        related_articles: relatedRows ?? [],
      },
      error: null,
    });
  } catch (err) {
    console.error("Unexpected error in GET /api/public/learn/article/[slug]:", err);
    return NextResponse.json(
      { data: null, error: { message: "Failed to fetch article", code: "INTERNAL_ERROR" } },
      { status: 500 }
    );
  }
}
